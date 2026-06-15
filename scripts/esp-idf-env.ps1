function Get-EspIdfPath {
  $candidates = @(
    "C:\Espressif\frameworks\esp-idf-v6.0.1",
    "C:\Espressif\frameworks\esp-idf",
    "$env:IDF_PATH"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path (Join-Path $candidate "export.ps1"))) {
      return $candidate
    }
  }

  $found = Get-ChildItem "C:\Espressif" -Recurse -Filter "export.ps1" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "esp-idf" } |
    Select-Object -First 1
  if ($found) {
    return Split-Path -Parent $found.FullName
  }

  return $null
}

function Import-EspIdfEnv {
  $idfPath = Get-EspIdfPath
  if (-not $idfPath) {
    throw "ESP-IDF was not found. See docs/ESP-IDF導入.md."
  }

  $env:IDF_PATH = $idfPath
  if (Test-Path "C:\Espressif\tools") {
    $env:IDF_TOOLS_PATH = "C:\Espressif"
  }
  New-Item -ItemType Directory -Force -Path "C:\Espressif\tmp" | Out-Null
  $env:TEMP = "C:\Espressif\tmp"
  $env:TMP = "C:\Espressif\tmp"

  . (Join-Path $idfPath "export.ps1")
}
