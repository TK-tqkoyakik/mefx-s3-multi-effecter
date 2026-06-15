$ErrorActionPreference = "Stop"
. "$PSScriptRoot\local-node.ps1"
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "server")
$node = Get-NodeCommand
$nodeDir = Get-LocalNodeDir
if ($nodeDir) {
  $env:PATH = "$nodeDir;$env:PATH"
}

& $node --test
