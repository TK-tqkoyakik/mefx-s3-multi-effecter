$ErrorActionPreference = "Stop"
. "$PSScriptRoot\esp-idf-env.ps1"
$asciiBuildScript = Join-Path $PSScriptRoot "build-firmware-ascii.ps1"
$latestPathFile = Join-Path $PSScriptRoot ".latest-firmware-build-path"

& $asciiBuildScript

$asciiSource = (Get-Content -LiteralPath $latestPathFile -Encoding ASCII | Select-Object -First 1).Trim()
if (!(Test-Path $asciiSource)) {
  throw "ASCII firmware build folder was not found: $asciiSource"
}

Set-Location $asciiSource
Import-EspIdfEnv
idf.py flash monitor
