$ErrorActionPreference = "Stop"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$portFile = Join-Path $env:TEMP "mefx-port-conflict-test.txt"
$serverOut = Join-Path $env:TEMP "mefx-port-conflict-server.out.txt"
$serverErr = Join-Path $env:TEMP "mefx-port-conflict-server.err.txt"
$appProcess = $null
$foreignServer = $null

Remove-Item -LiteralPath $portFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $serverOut, $serverErr -Force -ErrorAction SilentlyContinue

try {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  $nodeCandidates = @(
    $(if ($nodeCommand) { $nodeCommand.Source }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "nodejs\node.exe" }),
    $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" })
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  $node = $nodeCandidates | Select-Object -First 1
  if (!$node) { throw "Node.js was not found for the development-only port conflict test." }
  $serverScript = Resolve-Path (Join-Path $desktopRoot "test\foreign-health-server.mjs")
  $foreignServer = Start-Process -FilePath $node -ArgumentList @($serverScript.Path, "8787") `
    -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru

  $foreignHealth = $null
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if ($foreignServer.HasExited) {
      $detail = Get-Content -Raw -LiteralPath $serverErr -ErrorAction SilentlyContinue
      throw "Foreign test server exited early. $detail"
    }
    try {
      $foreignHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 1
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (!$foreignHealth -or $foreignHealth.service -ne "foreign-service") {
    throw "Foreign test server did not occupy port 8787."
  }

  $env:MEFX_VERIFY_START_ANALYZER = "1"
  $env:MEFX_VERIFY_ANALYZER_PORT_FILE = $portFile
  $exe = Resolve-Path (Join-Path $desktopRoot "release\win-unpacked\MEFX-S3 Desktop.exe")
  $appProcess = Start-Process -FilePath $exe.Path -WorkingDirectory (Split-Path $exe.Path) -WindowStyle Hidden -PassThru

  $selectedPort = $null
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    if (Test-Path -LiteralPath $portFile) {
      $selectedPort = [int](Get-Content -Raw -LiteralPath $portFile)
      break
    }
    if ($appProcess.HasExited) { throw "Packaged app exited early with code $($appProcess.ExitCode)." }
    Start-Sleep -Milliseconds 500
  }

  if (!$selectedPort) { throw "Analyzer did not report its selected port." }
  if ($selectedPort -eq 8787) { throw "Analyzer did not leave the occupied port 8787." }
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$selectedPort/health" -TimeoutSec 5
  if (!$health.ok -or $health.service -ne "multi-effecter-analysis-server") {
    throw "Fallback port did not return the MEFX analyzer health response."
  }

  Write-Host "[port-fallback] occupied: 8787"
  Write-Host "[port-fallback] selected: $selectedPort"
  Write-Host "[port-fallback] service: $($health.service)"
} finally {
  if ($appProcess -and !$appProcess.HasExited) { Stop-Process -Id $appProcess.Id -Force }
  if ($foreignServer -and !$foreignServer.HasExited) { Stop-Process -Id $foreignServer.Id -Force }
  Remove-Item -LiteralPath $portFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $serverOut, $serverErr -Force -ErrorAction SilentlyContinue
  Remove-Item Env:MEFX_VERIFY_START_ANALYZER -ErrorAction SilentlyContinue
  Remove-Item Env:MEFX_VERIFY_ANALYZER_PORT_FILE -ErrorAction SilentlyContinue
}
