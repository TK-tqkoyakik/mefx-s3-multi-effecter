$ErrorActionPreference = "Stop"
. "$PSScriptRoot\esp-idf-env.ps1"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "firmware"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$workRoot = "C:\Espressif\mefx_firmware_build_$stamp"
$latestPathFile = Join-Path $PSScriptRoot ".latest-firmware-build-path"

if (!(Test-Path $source)) {
  throw "firmware folder was not found."
}

New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
Set-Content -LiteralPath $latestPathFile -Value $workRoot -Encoding ASCII
Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
  if ($_.Name -in @("build", "sdkconfig", "sdkconfig.old")) {
    return
  }
  Copy-Item -LiteralPath $_.FullName -Destination $workRoot -Recurse -Force
}

Set-Location $workRoot
Import-EspIdfEnv
idf.py -D IDF_TARGET=esp32s3 build
Set-Content -LiteralPath $latestPathFile -Value $workRoot -Encoding ASCII
