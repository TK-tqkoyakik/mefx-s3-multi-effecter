param(
  [switch]$Unregister
)

$ErrorActionPreference = "Stop"

$protocolRoot = "HKCU:\Software\Classes\mefx"

if ($Unregister) {
  Remove-Item -Path $protocolRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Removed mefx:// protocol registration."
  exit 0
}

$launcher = (Resolve-Path (Join-Path $PSScriptRoot "mefx-local-analyzer.ps1")).Path
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$launcher`" `"%1`""

New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -Path $protocolRoot -Value "URL:MEFX Local Analyzer"
New-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

New-Item -Path "$protocolRoot\shell" -Force | Out-Null
New-Item -Path "$protocolRoot\shell\open" -Force | Out-Null
New-Item -Path "$protocolRoot\shell\open\command" -Force | Out-Null
Set-Item -Path "$protocolRoot\shell\open\command" -Value $command

Write-Host "Registered mefx:// protocol."
Write-Host "Launcher: $launcher"
Write-Host "Test URL: mefx://start"
