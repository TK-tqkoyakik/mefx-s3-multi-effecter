$ErrorActionPreference = "Stop"
. "$PSScriptRoot\local-node.ps1"

$root = Split-Path -Parent $PSScriptRoot
$pythonPackages = "C:\Espressif\mefx_python_packages"
$runtimePython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$torchHome = "C:\Espressif\mefx_torch_home"
$sampleDir = "C:\Espressif\mefx_demucs_warmup"
$sampleWav = Join-Path $sampleDir "silence.wav"

New-Item -ItemType Directory -Force -Path $torchHome | Out-Null
New-Item -ItemType Directory -Force -Path $sampleDir | Out-Null

$env:PYTHONPATH = "$pythonPackages;$env:PYTHONPATH"
$env:TORCH_HOME = $torchHome

$node = Get-NodeCommand
$ffmpeg = Join-Path $root "server\node_modules\ffmpeg-static\ffmpeg.exe"
$ffprobeDir = Join-Path $root "server\node_modules\ffprobe-static\bin\win32\x64"

if (!(Test-Path $ffmpeg)) {
  throw "ffmpeg-static was not found. Run scripts\install-analysis-tools.ps1 first."
}
if (!(Test-Path (Join-Path $ffprobeDir "ffprobe.exe"))) {
  throw "ffprobe-static was not found. Run scripts\install-analysis-tools.ps1 first."
}
$env:PATH = "$(Split-Path -Parent $ffmpeg);$ffprobeDir;$env:PATH"

& $ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=220:sample_rate=44100" -f lavfi -i "sine=frequency=440:sample_rate=44100" -filter_complex "[0:a][1:a]amerge=inputs=2" -t 12 -acodec pcm_s16le $sampleWav
if ($LASTEXITCODE -ne 0) {
  throw "ffmpeg failed while creating the Demucs warmup sample."
}

$runner = Join-Path $root "server\src\demucs_runner.py"
if (Test-Path $runtimePython) {
  & $runtimePython -u $runner --input $sampleWav --out $sampleDir --model htdemucs
} else {
  python -u $runner --input $sampleWav --out $sampleDir --model htdemucs
}
if ($LASTEXITCODE -ne 0) {
  throw "Demucs warmup failed. Check network access for model download."
}

Write-Host "Demucs model is ready."
Write-Host "TORCH_HOME: $torchHome"
