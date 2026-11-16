$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$start = Join-Path $root "JLCPCB_START_HERE.html"

if (!(Test-Path $start)) {
  throw "JLCPCB start page was not found: $start"
}

Start-Process $start
Write-Host "Opened JLCPCB start page:"
Write-Host $start
