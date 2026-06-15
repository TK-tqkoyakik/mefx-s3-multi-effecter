$ErrorActionPreference = "Stop"
. "$PSScriptRoot\local-node.ps1"
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "web")
$npm = Get-NpmCommand
$nodeDir = Get-LocalNodeDir
if ($nodeDir) {
  $env:PATH = "$nodeDir;$env:PATH"
}

if (!(Test-Path "node_modules")) {
  Write-Host "Installing web dependencies..."
  if (Test-Path "package-lock.json") {
    & $npm ci
  } else {
    & $npm install
  }
}

& $npm run build
