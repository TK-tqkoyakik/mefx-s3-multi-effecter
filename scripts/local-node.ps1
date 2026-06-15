function Get-ProjectRoot {
  return Split-Path -Parent $PSScriptRoot
}

function Get-LocalNodeDir {
  $root = Get-ProjectRoot
  $nodeDir = Get-ChildItem (Join-Path $root "tools") -Directory -Filter "node-*-win-x64" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if ($nodeDir) {
    return $nodeDir.FullName
  }
  return $null
}

function Get-NodeCommand {
  $local = Get-LocalNodeDir
  if ($local) {
    return Join-Path $local "node.exe"
  }
  return "node"
}

function Get-NpmCommand {
  $local = Get-LocalNodeDir
  if ($local) {
    return Join-Path $local "npm.cmd"
  }
  return "npm"
}
