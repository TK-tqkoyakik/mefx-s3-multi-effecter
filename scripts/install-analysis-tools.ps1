$ErrorActionPreference = "Stop"
. "$PSScriptRoot\local-node.ps1"

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server"
$pythonPackages = "C:\Espressif\mefx_python_packages"
$runtimePython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$torchHome = "C:\Espressif\mefx_torch_home"

New-Item -ItemType Directory -Force -Path $pythonPackages | Out-Null
New-Item -ItemType Directory -Force -Path $torchHome | Out-Null

Set-Location $server
$npm = Get-NpmCommand
$nodeDir = Get-LocalNodeDir
if ($nodeDir) {
  $env:PATH = "$nodeDir;$env:PATH"
}
if (Test-Path "package-lock.json") {
  & $npm ci
} else {
  & $npm install
}
if ($LASTEXITCODE -ne 0) {
  throw "npm dependency install failed."
}

if (Test-Path $runtimePython) {
  & $runtimePython -m pip install --upgrade --target $pythonPackages yt-dlp demucs torchcodec
} else {
  python -m pip install --upgrade --target $pythonPackages yt-dlp demucs torchcodec
}
if ($LASTEXITCODE -ne 0) {
  throw "Python package install failed."
}

Write-Host "Analysis tools installed."
Write-Host "yt-dlp package: $pythonPackages"
Write-Host "demucs package: $pythonPackages"
Write-Host "ffmpeg-static: server\node_modules\ffmpeg-static"
Write-Host "Demucs model cache: $torchHome"
