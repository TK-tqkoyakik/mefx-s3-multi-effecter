param(
  [switch]$Check
)

$ErrorActionPreference = "Stop"

$codexRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$codexNode = Join-Path $codexRoot "node\bin"
$codexBin = Join-Path $codexRoot "bin"
$env:Path = "$codexNode;$codexBin;$env:Path"

Set-Location -LiteralPath $PSScriptRoot

if ($Check) {
  & (Join-Path $codexNode "node.exe") --version
  & "$codexBin\pnpm.cmd" --version
  exit 0
}

$currentPid = $PID
$staleProcesses = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $currentPid -and (
    $_.CommandLine -like "*127.0.0.1:5174*" -or
    $_.CommandLine -like "*VITE_DEV_SERVER_URL*" -or
    $_.CommandLine -like "*apps*desktop*node_modules*.pnpm*electron*" -or
    $_.CommandLine -like "*apps*desktop*node_modules*electron*cli.js*"
  )
}

foreach ($process in $staleProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$portOwners = Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($portOwner in $portOwners) {
  if ($portOwner -ne $currentPid) {
    Stop-Process -Id $portOwner -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Milliseconds 500

& "$codexBin\pnpm.cmd" run build
& "$codexBin\pnpm.cmd" run start
