$ErrorActionPreference = "Continue"
. "$PSScriptRoot\local-node.ps1"
. "$PSScriptRoot\esp-idf-env.ps1"

function Test-Command($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    Write-Host "[OK] $Name -> $($cmd.Source)" -ForegroundColor Green
    & $Name --version
  } else {
    Write-Host "[NG] $Name is not installed or not in PATH" -ForegroundColor Red
  }
}

Write-Host "MEFX-S3 environment check" -ForegroundColor Cyan
Test-Command "git"

$localNode = Get-NodeCommand
$localNpm = Get-NpmCommand
if (Test-Path $localNode) {
  Write-Host "[OK] node -> $localNode" -ForegroundColor Green
  & $localNode -v
} else {
  Test-Command "node"
}

if (Test-Path $localNpm) {
  Write-Host "[OK] npm -> $localNpm" -ForegroundColor Green
  & $localNpm -v
} else {
  Test-Command "npm"
}

$idfPath = Get-EspIdfPath
if ($idfPath) {
  Write-Host "[OK] ESP-IDF -> $idfPath" -ForegroundColor Green
} else {
  Test-Command "idf.py"
}

$kicad = Get-Command kicad -ErrorAction SilentlyContinue
if ($kicad) {
  Write-Host "[OK] kicad -> $($kicad.Source)" -ForegroundColor Green
} elseif (Test-Path "C:\Program Files\KiCad\10.0\bin\kicad.exe") {
  Write-Host "[OK] kicad -> C:\Program Files\KiCad\10.0\bin\kicad.exe" -ForegroundColor Green
} else {
  Write-Host "[NG] kicad is not installed or not in PATH" -ForegroundColor Red
}

if (Test-Path "C:\Espressif") {
  $export = Get-ChildItem "C:\Espressif" -Recurse -Filter "export.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($export) {
    Write-Host "[INFO] ESP-IDF export script found -> $($export.FullName)" -ForegroundColor Cyan
  } else {
    Write-Host "[INFO] C:\Espressif exists, but ESP-IDF itself was not found yet" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Expected next commands:"
Write-Host "  cd server; npm install; npm run dev"
Write-Host "  cd web; npm install; npm run dev"
Write-Host "  cd firmware; idf.py set-target esp32s3; idf.py build"
