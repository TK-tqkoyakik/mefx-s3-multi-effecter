$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "docs\kicad\mefx_s3.kicad_pro"
$kicad = Get-Command kicad -ErrorAction SilentlyContinue
if ($kicad) {
  Start-Process -FilePath $kicad.Source -ArgumentList "`"$project`""
  exit
}

$known = "C:\Program Files\KiCad\10.0\bin\kicad.exe"
if (Test-Path $known) {
  Start-Process -FilePath $known -ArgumentList "`"$project`""
  exit
}

Write-Error "KiCadが見つかりません。C:\Program Files\KiCad\10.0\bin\kicad.exe を確認してください。"
