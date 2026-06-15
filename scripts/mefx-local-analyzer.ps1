param(
  [string]$LaunchUrl = "",
  [switch]$NoInstall
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\local-node.ps1"

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server"
$pythonPackages = "C:\Espressif\mefx_python_packages"

function Test-AnalyzerRunning {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-AnalyzerRunning) {
  Write-Host "MEFX local analyzer is already running."
  exit 0
}

$node = Get-NodeCommand
if ($node -eq "node" -and !(Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed or not in PATH. Install Node.js, then run this launcher again."
}

$needsNodeModules = !(Test-Path (Join-Path $server "node_modules\ffmpeg-static"))
$needsPythonTools =
  !(Test-Path (Join-Path $pythonPackages "yt_dlp")) -or
  !(Test-Path (Join-Path $pythonPackages "demucs"))

if (!$NoInstall -and ($needsNodeModules -or $needsPythonTools)) {
  Write-Host "Installing MEFX analysis tools. This can take several minutes on first use..."
  & "$PSScriptRoot\install-analysis-tools.ps1"
  if ($LASTEXITCODE -ne 0) {
    throw "Analysis tool installation failed."
  }
}

$env:HOST = "127.0.0.1"
$env:PORT = "8787"
$env:MEFX_AUTO_SHUTDOWN = "1"
$env:MEFX_IDLE_TIMEOUT_MS = "60000"
$env:MEFX_CLOSE_GRACE_MS = "12000"

Set-Location $server
Write-Host "Starting MEFX local analyzer..."
Write-Host "URL: http://127.0.0.1:8787/health"
Write-Host "This window will close after the web page is closed and heartbeat stops."
& $node "src\server.js"
