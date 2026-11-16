$ErrorActionPreference = "Stop"
$desktopRoot = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $desktopRoot "node_modules\electron\dist\electron.exe"
$runner = Join-Path $desktopRoot "test\ui-smoke.cjs"
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("mefx-ui-" + [Guid]::NewGuid().ToString("N"))
$previousTestDirectory = $env:MEFX_UI_TEST_DIRECTORY
$process = $null
$exitCode = 1
New-Item -ItemType Directory -Path $scratch | Out-Null
try {
  $env:MEFX_UI_TEST_DIRECTORY = Join-Path $scratch ([string][char]0x65e5 + [char]0x672c + [char]0x8a9e)
  $out = Join-Path $scratch "stdout.txt"
  $err = Join-Path $scratch "stderr.txt"
  $process = Start-Process -FilePath $exe -ArgumentList ('"' + $runner + '"') -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  if (!$process.WaitForExit(55000)) { Stop-Process -Id $process.Id -Force; throw "UI runner timed out." }
  Get-Content -LiteralPath $out -Encoding UTF8
  Get-Content -LiteralPath $err -Encoding UTF8
  $exitCode = $process.ExitCode
} finally {
  if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id -Force }
  $env:MEFX_UI_TEST_DIRECTORY = $previousTestDirectory
  $resolvedScratch = [IO.Path]::GetFullPath($scratch)
  $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\mefx-ui-'
  if (!$resolvedScratch.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected UI test cleanup path." }
  Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
}
exit $exitCode
