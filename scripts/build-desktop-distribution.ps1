param(
  [switch]$SkipBuild,
  [switch]$SkipDefenderScan,
  [ValidateSet("Unsigned", "Valid")]
  [string]$ExpectedSignature = "Unsigned",
  [ValidateSet("Installer", "Zip")]
  [string]$PackageFormat = "Zip",
  [ValidatePattern("^[0-9]+_[^\\/]+$")]
  [string]$OutputFolder = "02_別PC配布"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$desktopRoot = Join-Path $root "apps\desktop"
$packagePath = Join-Path $desktopRoot "package.json"
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$productName = if ($package.build.productName) { $package.build.productName } else { $package.name }
$version = $package.version
$installerName = if ($PackageFormat -eq "Zip") { "$productName $version Windows.zip" } else { "$productName Setup $version.exe" }
$installerPath = Join-Path $desktopRoot "release\$installerName"
$distributionDir = Join-Path (Join-Path $root "output\desktop") $OutputFolder
$docsDir = Join-Path $root "docs\app\distribution"
if (Test-Path -LiteralPath $distributionDir) {
  throw "配布先は既に存在します。既存版を保持するため、-OutputFolderで新しい数字付きフォルダを指定してください。"
}

function Get-PnpmCommand {
  $command = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $fallback = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  throw "pnpm.cmdが見つかりません。"
}

if (!$SkipBuild) {
  $pnpm = Get-PnpmCommand
  Push-Location $desktopRoot
  try {
    & $pnpm test
    if ($LASTEXITCODE -ne 0) { throw "BLE送信データテストに失敗しました。" }
    if ($PackageFormat -eq "Zip" -and $ExpectedSignature -eq "Valid") { throw "署名ZIPはアプリ内容を別途署名後、-SkipBuildで作成してください。" }
    $buildCommand = if ($PackageFormat -eq "Zip") { "package:zip:unsigned" } elseif ($ExpectedSignature -eq "Valid") { "package:installer" } else { "package:installer:unsigned" }
    & $pnpm run $buildCommand
    if ($LASTEXITCODE -ne 0) { throw "未署名インストーラーの生成に失敗しました。" }
  } finally {
    Pop-Location
  }
}

if (!(Test-Path -LiteralPath $installerPath)) {
  throw "インストーラーが見つかりません: $installerPath"
}

& (Join-Path $desktopRoot "scripts\check-signature.ps1") -Expected $ExpectedSignature -AppOnly:($PackageFormat -eq "Zip")

$distributionParent = [System.IO.Path]::GetFullPath((Join-Path $root "output\desktop")).TrimEnd('\') + '\'
$resolvedDistribution = [System.IO.Path]::GetFullPath($distributionDir)
if (!$resolvedDistribution.StartsWith($distributionParent, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "想定外の出力先なので削除を拒否しました: $resolvedDistribution"
}
New-Item -ItemType Directory -Force -Path $distributionDir | Out-Null
$destinationInstaller = Join-Path $distributionDir $installerName
Copy-Item -LiteralPath $installerPath -Destination $destinationInstaller -Force

$docNames = @("01_別PCインストール手順.txt", "02_動作確認チェックリスト.txt", "03_既知の制限.txt")
foreach ($name in $docNames) {
  $content = Get-Content -Raw -LiteralPath (Join-Path $docsDir $name)
  $content = $content.Replace("MEFX-S3 Desktop Setup 0.1.0.exe", $installerName).Replace("{PACKAGE_NAME}", $installerName).Replace("{PACKAGE_FORMAT}", $PackageFormat)
  Set-Content -LiteralPath (Join-Path $distributionDir $name) -Encoding utf8 -Value $content
}
Copy-Item -LiteralPath (Join-Path $root "docs\app\08_実機なし改善と追加調査.txt") -Destination (Join-Path $distributionDir "06_検証と追加作業.txt") -Force
Copy-Item -LiteralPath (Join-Path $root "docs\app\09_接続と配布安定化.txt") -Destination (Join-Path $distributionDir "07_接続と配布安定化.txt")

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $destinationInstaller
$hashFile = "$destinationInstaller.sha256.txt"
Set-Content -LiteralPath $hashFile -Encoding ascii -Value "$($hash.Hash) *$installerName"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
if (!(Test-Path -LiteralPath $node)) { throw "ビルド記録の生成に必要なNode.jsが見つかりません。" }
& $node (Join-Path $root "scripts\generate-desktop-manifest.mjs") --out $distributionDir --artifact $destinationInstaller
if ($LASTEXITCODE -ne 0) { throw "ビルド記録と同梱ライセンスの生成に失敗しました。" }

$scanResult = "Defenderスキャン: スキップ"
if (!$SkipDefenderScan) {
  $defender = Get-Command Start-MpScan -ErrorAction SilentlyContinue
  if ($defender) {
    try {
      Start-MpScan -ScanType CustomScan -ScanPath $destinationInstaller
      $scanResult = "Defenderスキャン: 実行完了（Windowsセキュリティの保護履歴も確認してください）"
    } catch {
      $scanResult = "Defenderスキャン: 実行失敗 - $($_.Exception.Message)"
    }
  } else {
    $scanResult = "Defenderスキャン: Start-MpScanが利用できないため未実行"
  }
}
Add-Content -LiteralPath (Join-Path $distributionDir "02_動作確認チェックリスト.txt") -Encoding utf8 -Value "`r`n自動生成時の結果`r`n----------------`r`n$scanResult"

Write-Host "[distribution] 出力先: $distributionDir"
Write-Host "[distribution] インストーラー: $installerName"
Write-Host "[distribution] SHA-256: $($hash.Hash)"
Write-Host "[distribution] $scanResult"
