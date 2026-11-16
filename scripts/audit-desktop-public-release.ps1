param(
  [Parameter(Mandatory=$true)][string]$BundlePath,
  [Parameter(Mandatory=$true)][string]$ManifestPath,
  [Parameter(Mandatory=$true)][string]$ReportPath
)
$ErrorActionPreference = "Stop"
$bundle = (Resolve-Path -LiteralPath $BundlePath).Path.TrimEnd('\')
$manifest = Get-Content -Raw -LiteralPath $ManifestPath -Encoding utf8 | ConvertFrom-Json
if (Test-Path -LiteralPath $ReportPath) { throw "Preserve the previous audit; choose a new report path." }
$files = @(Get-ChildItem -LiteralPath $bundle -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll', '.node', '.pyd') })
if (!$files.Count) { throw "No Windows binaries found in the supplied bundle." }
$inventory = @($files | ForEach-Object {
  $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName
  [pscustomobject]@{
    path = $_.FullName.Substring($bundle.Length + 1)
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    status = [string]$signature.Status
  }
})
$unsigned = @($inventory | Where-Object { $_.status -ne 'Valid' })
$licenseUnknown = @($manifest.licenseUnknown)
$reasons = @()
if ($unsigned.Count) { $reasons += "$($unsigned.Count) binaries do not have a Valid Authenticode signature." }
if ($licenseUnknown.Count) { $reasons += "$($licenseUnknown.Count) redistribution-license/source conditions remain unverified." }
$reasons += "Clean-PC install/uninstall, all-feature Smart App Control testing, and final artifact hash verification require a release acceptance record."
$report = [ordered]@{
  schemaVersion = 1
  checkedAtUtc = [DateTime]::UtcNow.ToString('o')
  version = $manifest.package.version
  publicReleaseReady = $false
  note = "Read-only audit, not legal advice or a Smart App Control guarantee. No security settings changed."
  binaryCount = $inventory.Count
  nonValidSignatureCount = $unsigned.Count
  unresolvedLicenseCount = $licenseUnknown.Count
  blockers = $reasons
  binaries = $inventory
  unresolvedLicenses = $licenseUnknown
}
$parent = Split-Path -Parent ([IO.Path]::GetFullPath($ReportPath))
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8
Write-Host "[public-release] $($inventory.Count) binaries checked; $($unsigned.Count) non-valid; $($licenseUnknown.Count) license/source conditions unresolved."
Write-Host "[public-release] Not approved for public distribution. Report: $ReportPath"
