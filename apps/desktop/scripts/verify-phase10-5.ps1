param([switch]$SkipBuild)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$binDir = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin"

if (Test-Path $nodeDir) {
  $env:PATH = "$nodeDir;$binDir;$($binDir)\fallback;$env:PATH"
}

function Get-PnpmCommand {
  $command = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $command = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $fallback = Join-Path $binDir "fallback\pnpm.cmd"
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  throw "pnpm was not found."
}

$pnpm = Get-PnpmCommand

function Stop-IfRunning($process) {
  if ($null -ne $process -and !$process.HasExited) {
    $null = $process.CloseMainWindow()
    if (!$process.WaitForExit(15000)) { Stop-Process -Id $process.Id -Force }
  }
}

function Assert-ToolVersion($toolPath, $label) {
  if (!(Test-Path -LiteralPath $toolPath)) {
    throw "$label was not found: $toolPath"
  }
  $output = & $toolPath -version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "$label did not run successfully: $toolPath"
  }
  $firstLine = ($output | Select-Object -First 1)
  Write-Host "[verify-10.5] $label available: $firstLine"
}

function Assert-PythonVersion($pythonPath) {
  if (!(Test-Path -LiteralPath $pythonPath)) {
    throw "Bundled Python was not found: $pythonPath"
  }
  $output = & $pythonPath --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Bundled Python did not run successfully: $pythonPath"
  }
  Write-Host "[verify-10.5] bundled Python available: $output"
}

function Assert-PythonPackage($pythonPath, $packagesPath, $moduleName, $label) {
  if (!(Test-Path -LiteralPath $packagesPath)) {
    throw "Bundled Python packages folder was not found: $packagesPath"
  }
  $previousPythonPath = $env:PYTHONPATH
  $env:PYTHONPATH = $packagesPath
  try {
    $output = & $pythonPath -c "import $moduleName; print(getattr($moduleName, '__version__', 'import-ok'))" 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "$label import failed from bundled packages: $output"
    }
    $firstLine = ($output | Select-Object -First 1)
    Write-Host "[verify-10.5] $label import passed: $firstLine"
  } finally {
    $env:PYTHONPATH = $previousPythonPath
  }
}

function Assert-DemucsModelCache($torchHomePath) {
  if (!(Test-Path -LiteralPath $torchHomePath)) {
    throw "Bundled Demucs model cache was not found: $torchHomePath"
  }
  $checkpoints = Get-ChildItem -LiteralPath (Join-Path $torchHomePath "hub\checkpoints") -Filter "*.th" -File -ErrorAction SilentlyContinue
  if (!$checkpoints -or $checkpoints.Count -eq 0) {
    throw "Bundled Demucs model cache does not contain checkpoint files: $torchHomePath"
  }
  $totalMb = [math]::Round((($checkpoints | Measure-Object Length -Sum).Sum) / 1MB, 1)
  Write-Host "[verify-10.5] Demucs model cache available: $($checkpoints.Count) checkpoint(s), $totalMb MB"
}

function Use-MinimalRuntimePath() {
  $systemRoot = $env:SystemRoot
  $system32 = Join-Path $systemRoot "System32"
  $env:PATH = "$system32;$systemRoot"
  Write-Host "[verify-10.5] PATH reduced to Windows runtime paths for packaged-app checks."
}

Push-Location $root
try {
  if (!$SkipBuild) {
    Write-Host "[verify-10.5] Building unpacked Windows app..."
    & $pnpm run package:dir:unsigned
    if ($LASTEXITCODE -ne 0) { throw "pnpm run package:dir:unsigned failed." }
  }

  $source = Resolve-Path "release\win-unpacked"
  $copyRoot = Join-Path $root ("release\06_copy_test_" + [guid]::NewGuid().ToString("N"))
  $copyApp = Join-Path $copyRoot "MEFX-S3 Desktop"

  New-Item -ItemType Directory -Path $copyApp | Out-Null
  robocopy $source.Path $copyApp /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  $robocopyCode = $LASTEXITCODE
  if ($robocopyCode -gt 7) {
    throw "robocopy failed with code $robocopyCode"
  }

  Use-MinimalRuntimePath

  $exe = Resolve-Path (Join-Path $copyApp "MEFX-S3 Desktop.exe")
  $serverEntry = Resolve-Path (Join-Path $copyApp "resources\server\src\server.js")
  $serverNodeModules = Resolve-Path (Join-Path $copyApp "resources\server\node_modules")
  $ffmpeg = Resolve-Path (Join-Path $serverNodeModules.Path "ffmpeg-static\ffmpeg.exe")
  $ffprobe = Resolve-Path (Join-Path $serverNodeModules.Path "ffprobe-static\bin\win32\x64\ffprobe.exe")
  $python = Resolve-Path (Join-Path $copyApp "resources\tools\python\python.exe")
  $pythonPackages = Resolve-Path (Join-Path $copyApp "resources\tools\python-packages")
  $torchHome = Resolve-Path (Join-Path $copyApp "resources\tools\torch-home")

  Write-Host "[verify-10.5] Checking bundled media tools..."
  Assert-ToolVersion $ffmpeg.Path "ffmpeg"
  Assert-ToolVersion $ffprobe.Path "ffprobe"
  Assert-PythonVersion $python.Path
  Assert-PythonPackage $python.Path $pythonPackages.Path "yt_dlp" "yt-dlp"
  Assert-PythonPackage $python.Path $pythonPackages.Path "demucs" "Demucs"
  Assert-PythonPackage $python.Path $pythonPackages.Path "torch" "PyTorch"
  Assert-PythonPackage $python.Path $pythonPackages.Path "torchaudio" "Torchaudio"
  Assert-DemucsModelCache $torchHome.Path
  & $python.Path (Join-Path $root "..\..\scripts\verify-desktop-python.py") --packages $pythonPackages.Path --torch-home $torchHome.Path
  if ($LASTEXITCODE -ne 0) { throw "Packaged Python/model lock validation failed." }

  Write-Host "[verify-10.5] Starting copied packaged app with internal analyzer..."
  $previousVerifyAnalyzer = $env:MEFX_VERIFY_START_ANALYZER
  $previousVerifyPortFile = $env:MEFX_VERIFY_ANALYZER_PORT_FILE
  $portFile = Join-Path $env:TEMP ("mefx-analyzer-port-" + [guid]::NewGuid().ToString("N") + ".txt")
  $env:MEFX_VERIFY_START_ANALYZER = "1"
  $env:MEFX_VERIFY_ANALYZER_PORT_FILE = $portFile
  $appProcess = $null
  try {
    try {
      $appProcess = Start-Process -FilePath $exe.Path -WorkingDirectory $copyApp -WindowStyle Hidden -PassThru
    } catch {
      if ($_.Exception.Message -like "*Application Control*") {
        throw "Packaged app launch was blocked by Windows Application Control; this is NOT a successful startup test."
      }
      throw
    }

    Start-Sleep -Seconds 2
    if ($appProcess.HasExited) {
      throw "Copied packaged app exited early with code $($appProcess.ExitCode)."
    }

    $health = $null
    $analyzerPort = $null
    for ($attempt = 0; $attempt -lt 10; $attempt += 1) {
      if ($appProcess.HasExited) {
        throw "Copied packaged app exited before analyzer became ready with code $($appProcess.ExitCode)."
      }
      try {
        if (Test-Path -LiteralPath $portFile) {
          $analyzerPort = [int](Get-Content -Raw -LiteralPath $portFile)
        }
        if ($analyzerPort) {
          $health = Invoke-RestMethod -Uri "http://127.0.0.1:$analyzerPort/health" -TimeoutSec 2
        }
        if ($health) {
          break
        }
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
    if ($null -eq $health) {
      throw "Analyzer health endpoint did not become ready."
    }
    if (!$health.ok -or $health.service -ne "multi-effecter-analysis-server") {
      throw "Analyzer health did not identify the MEFX analysis server."
    }
    Write-Host "[verify-10.5] Copied packaged app smoke test passed."
    Write-Host "[verify-10.5] Internal analyzer health passed: $($health.service) $($health.version)"
  } finally {
    Stop-IfRunning $appProcess
    $env:MEFX_VERIFY_START_ANALYZER = $previousVerifyAnalyzer
    $env:MEFX_VERIFY_ANALYZER_PORT_FILE = $previousVerifyPortFile
    Remove-Item -LiteralPath $portFile -Force -ErrorAction SilentlyContinue
  }

  Write-Host "[verify-10.5] Copy path: $copyApp"
  Write-Host "[verify-10.5] Analyzer entry: $($serverEntry.Path)"
  Write-Host "[verify-10.5] Analyzer node_modules: $($serverNodeModules.Path)"
  Write-Host "[verify-10.5] ffmpeg: $($ffmpeg.Path)"
  Write-Host "[verify-10.5] ffprobe: $($ffprobe.Path)"
  Write-Host "[verify-10.5] Python: $($python.Path)"
  Write-Host "[verify-10.5] Python packages: $($pythonPackages.Path)"
  Write-Host "[verify-10.5] Demucs model cache: $($torchHome.Path)"
} finally {
  Pop-Location
}
