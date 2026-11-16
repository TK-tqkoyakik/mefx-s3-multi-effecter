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

Push-Location $root
try {
  Write-Host "[verify] Building desktop app..."
  & $pnpm run build
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm run build failed."
  }

  Write-Host "[verify] Starting Electron smoke test..."
  $electron = Resolve-Path "node_modules\.bin\electron.cmd"
  $proc = Start-Process -FilePath $electron.Path -ArgumentList "." -WorkingDirectory $root -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 5
  if ($proc.HasExited) {
    throw "Electron exited early with code $($proc.ExitCode)."
  }
  Stop-Process -Id $proc.Id -Force
  Write-Host "[verify] Electron smoke test passed."

  Write-Host "[verify] Checking analyzer server health..."
  $node = Join-Path $nodeDir "node.exe"
  if (!(Test-Path $node)) {
    $node = "node"
  }
  $serverRoot = Resolve-Path "..\..\server"
  $testPort = 18787
  $previousPort = $env:PORT
  $env:PORT = [string]$testPort
  $server = Start-Process -FilePath $node -ArgumentList "src/server.js" -WorkingDirectory $serverRoot.Path -WindowStyle Hidden -PassThru
  $env:PORT = $previousPort
  Start-Sleep -Seconds 3
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/health" -TimeoutSec 5
    if (!$health.ok -or $health.service -ne "multi-effecter-analysis-server") {
      throw "Analyzer health did not identify the MEFX analysis server."
    }
    Write-Host "[verify] Analyzer health passed: $($health.service) $($health.version)"
  } finally {
    if (!$server.HasExited) {
      Stop-Process -Id $server.Id -Force
    }
  }

  Write-Host "[verify] Checking audio file conversion/render tools..."
  $ffmpeg = Resolve-Path "..\..\server\node_modules\ffmpeg-static\ffmpeg.exe"
  $sourceWav = Join-Path $env:TEMP "mefx-audio-source-test.wav"
  $convertedWav = Join-Path $env:TEMP "mefx-audio-converted-test.wav"
  $processedWav = Join-Path $env:TEMP "mefx-audio-processed-test.wav"

  & $ffmpeg.Path -y -f lavfi -i "sine=frequency=440:duration=1" -vn -ac 2 -ar 44100 -c:a pcm_s16le $sourceWav
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $sourceWav)) {
    throw "Could not create audio file source test WAV."
  }

  & $ffmpeg.Path -y -i $sourceWav -vn -ac 2 -ar 44100 -c:a pcm_s16le $convertedWav
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $convertedWav)) {
    throw "Audio file WAV conversion test failed."
  }

  $filter = "volume=1.000,equalizer=f=1200:t=q:w=0.9:g=2.00,acompressor=threshold=-18.0dB:ratio=2.00:attack=8:release=180,acrusher=level_in=1.500:level_out=0.900:bits=18,aphaser=in_gain=0.65:out_gain=0.75:delay=5.00:decay=0.40:speed=0.80:type=t,aecho=0.82:0.34:180:0.35,alimiter=limit=0.95"
  & $ffmpeg.Path -y -i $sourceWav -vn -af $filter -ac 2 -ar 44100 -c:a pcm_s16le $processedWav
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $processedWav)) {
    throw "Audio file effect render test failed."
  }

  Write-Host "[verify] Audio file conversion/render tools passed."
} finally {
  Pop-Location
}
