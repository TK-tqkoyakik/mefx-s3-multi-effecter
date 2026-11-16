param(
  [Parameter(Mandatory=$true)][string]$Compiler,
  [Parameter(Mandatory=$true)][string]$CjsonRoot
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "build_artifacts\04_firmware_json_test"
New-Item -ItemType Directory -Path $out -Force | Out-Null
$testRoot = Join-Path $root "firmware\tests\01_preset_json"
$exe = Join-Path $out "preset-json-test.exe"
& $Compiler cc -std=c11 -Wall -Wextra -Werror -O1 `
  -I $testRoot -I (Join-Path $root "firmware\components\preset_store\include") `
  -I (Join-Path $root "firmware\components\dsp\include") -I $CjsonRoot `
  (Join-Path $testRoot "test_preset_json.c") (Join-Path $root "firmware\components\preset_store\preset_json.c") `
  (Join-Path $CjsonRoot "cJSON.c") -o $exe
if ($LASTEXITCODE -ne 0) { throw "Firmware JSON host compilation failed." }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Firmware JSON host tests failed." }
