param(
  [ValidateSet("Any", "Unsigned", "Valid")]
  [string]$Expected = "Any",
  [switch]$AppOnly
)

$ErrorActionPreference = "Stop"

$packagePath = Join-Path $PSScriptRoot "..\package.json"
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$productName = if ($package.build.productName) { $package.build.productName } else { $package.name }
$version = $package.version
$unpackedPath = Join-Path $PSScriptRoot "..\release\win-unpacked"
$exePath = Join-Path $unpackedPath "$productName.exe"
$installerPath = Join-Path $PSScriptRoot "..\release\$productName Setup $version.exe"

function Test-SignatureStatus {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "[signature] missing: $Path"
    throw "Signature target is missing: $Path"
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  Write-Host "[signature] $Path"
  Write-Host "  Status: $($signature.Status)"
  Write-Host "  Message: $($signature.StatusMessage)"
  if ($signature.SignerCertificate) {
    Write-Host "  Subject: $($signature.SignerCertificate.Subject)"
    Write-Host "  Issuer:  $($signature.SignerCertificate.Issuer)"
    Write-Host "  Expires: $($signature.SignerCertificate.NotAfter.ToString('yyyy-MM-dd HH:mm:ss'))"
  }

  if ($Expected -eq "Valid" -and $signature.Status -ne "Valid") {
    throw "Expected a valid signature, but status was $($signature.Status): $Path"
  }
  if ($Expected -eq "Unsigned" -and $signature.Status -ne "NotSigned") {
    throw "Expected an unsigned test build, but status was $($signature.Status): $Path"
  }
}

Test-SignatureStatus -Path $exePath
if (!$AppOnly) { Test-SignatureStatus -Path $installerPath }

if ($Expected -eq "Valid") {
  $loadedBinaries = Get-ChildItem -LiteralPath $unpackedPath -Recurse -File |
    Where-Object { $_.Extension -in @(".exe", ".dll", ".node", ".pyd") }
  foreach ($binary in $loadedBinaries) {
    Test-SignatureStatus -Path $binary.FullName
  }
}
