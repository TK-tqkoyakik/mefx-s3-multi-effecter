$ErrorActionPreference = "Stop"
. "$PSScriptRoot\local-node.ps1"

$root = Split-Path -Parent $PSScriptRoot
$node = Get-NodeCommand
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Start-NodeProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Script,
    [string[]]$Arguments
  )

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $node
  $allArgs = @($Script) + $Arguments
  $psi.Arguments = ($allArgs | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join " "
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()

  $outLog = Join-Path $logs "$Name.log"
  $errLog = Join-Path $logs "$Name.err.log"
  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()
  Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -Action {
    if ($EventArgs.Data) { Add-Content -LiteralPath $Event.MessageData -Value $EventArgs.Data }
  } -MessageData $outLog | Out-Null
  Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action {
    if ($EventArgs.Data) { Add-Content -LiteralPath $Event.MessageData -Value $EventArgs.Data }
  } -MessageData $errLog | Out-Null

  Write-Host "$Name started: PID $($process.Id)"
}

$serverDir = Join-Path $root "server"
$webDir = Join-Path $root "web"

Start-NodeProcess `
  -Name "server-dev" `
  -WorkingDirectory $serverDir `
  -Script (Join-Path $serverDir "src\server.js") `
  -Arguments @()

Start-NodeProcess `
  -Name "web-dev" `
  -WorkingDirectory $webDir `
  -Script (Join-Path $webDir "node_modules\vite\bin\vite.js") `
  -Arguments @("--host", "0.0.0.0")

Start-Sleep -Seconds 3

Write-Host "Web app: http://localhost:5173/?sim=1"
Write-Host "Analysis health: http://localhost:8787/health"
