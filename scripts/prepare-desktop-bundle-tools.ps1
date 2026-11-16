param(
  [switch]$SkipDemucsWarmup,
  [switch]$Offline,
  [string]$PythonRoot
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $root "tools"
$lock = Join-Path $PSScriptRoot "desktop-analysis-requirements.lock.txt"
$buildLock = Join-Path $PSScriptRoot "desktop-python-build.lock.txt"
$archives = Join-Path $toolsRoot "01_python_archives"
$serverRoot = Join-Path $root "server"
$torchHome = Join-Path $toolsRoot "torch-home"
if (!$PythonRoot) {
  $PythonRoot = if ($env:PythonLocation) { $env:PythonLocation } else { Split-Path -Parent (Get-Command python -ErrorAction Stop).Source }
}
$runtimePython = Join-Path $PythonRoot "python.exe"
if (!(Test-Path -LiteralPath $lock) -or !(Test-Path -LiteralPath $buildLock)) { throw "Hashed Python lock files are missing." }
$version = & $runtimePython -c "import platform; print(platform.python_version())"
if ($LASTEXITCODE -ne 0 -or $version -ne "3.12.13") { throw "The locked Windows x64 bundle requires CPython 3.12.13, not $version." }
$bits = & $runtimePython -c "import struct; print(struct.calcsize('P') * 8)"
if ($bits -ne "64") { throw "The analysis bundle requires x64 Python." }

$stage = Join-Path $toolsRoot ("02_python_build_" + [guid]::NewGuid().ToString("N"))
function Assert-ToolsPath([string]$Path) {
  $base = [IO.Path]::GetFullPath($toolsRoot).TrimEnd('\') + '\'
  if (![IO.Path]::GetFullPath($Path).StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected tools path: $Path" }
}
Assert-ToolsPath $stage
$buildEnv = Join-Path $stage "build-env"
$pythonTarget = Join-Path $stage "python"
$packages = Join-Path $stage "python-packages"
New-Item -ItemType Directory -Path $stage, $archives, $torchHome -Force | Out-Null
Write-Host "[bundle-tools] Staging a locked environment; existing tools remain unchanged until validation succeeds."
& $runtimePython -m venv $buildEnv
if ($LASTEXITCODE -ne 0) { throw "Cannot create the clean build environment: $stage" }
$builder = Join-Path $buildEnv "Scripts\python.exe"
$indexArgs = @("--find-links", $archives)
if ($Offline) { $indexArgs += "--no-index" }
& $builder -m pip --isolated install --no-cache-dir --require-hashes --no-deps @indexArgs -r $buildLock
if ($LASTEXITCODE -ne 0) { throw "Pinned build-tool installation failed; old bundle preserved." }
& $builder -m pip --isolated install --no-cache-dir --require-hashes --no-deps --no-build-isolation --no-compile @indexArgs --target $packages -r $lock
if ($LASTEXITCODE -ne 0) { throw "Hashed analysis-package installation failed; old bundle preserved." }

robocopy $PythonRoot $pythonTarget /E /NFL /NDL /NJH /NJS /NP `
  /XD (Join-Path $PythonRoot "Lib\site-packages") (Join-Path $PythonRoot "Lib\test") (Join-Path $PythonRoot "Scripts") `
  /XF "*.pdb" | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Python runtime copy failed; old bundle preserved." }
$bundledPython = Join-Path $pythonTarget "python.exe"
$oldPythonPath = $env:PYTHONPATH
$oldTorchHome = $env:TORCH_HOME
$oldPath = $env:PATH
$oldNoUserSite = $env:PYTHONNOUSERSITE
try {
  $env:PYTHONPATH = $packages
  $env:PYTHONNOUSERSITE = "1"
  $env:TORCH_HOME = $torchHome
  & $builder -m pip check
  if ($LASTEXITCODE -ne 0) { throw "Python dependency consistency check failed." }
  & $bundledPython -c "import torch,torchaudio,demucs,yt_dlp; assert torch.__version__ == torchaudio.__version__ == '2.11.0+cpu'; print('Locked analysis imports OK')"
  if ($LASTEXITCODE -ne 0) { throw "Bundled Python import validation failed." }
  $pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
  Push-Location $serverRoot
  try {
    & $pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "Server frozen-lockfile installation failed." }
  } finally { Pop-Location }
  $ffmpeg = Join-Path $serverRoot "node_modules\ffmpeg-static\ffmpeg.exe"
  $ffprobe = Join-Path $serverRoot "node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe"
  $env:PATH = "$(Split-Path -Parent $ffmpeg);$(Split-Path -Parent $ffprobe);$oldPath"
  if (!$SkipDemucsWarmup) {
    $sample = Join-Path $stage "warmup.wav"
    & $ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=220:sample_rate=44100" -t 2 -ac 2 -c:a pcm_s16le $sample
    if ($LASTEXITCODE -ne 0) { throw "Warmup sample creation failed." }
    & $bundledPython -u (Join-Path $serverRoot "src\demucs_runner.py") --input $sample --out $stage --model htdemucs
    if ($LASTEXITCODE -ne 0) { throw "Demucs model validation failed." }
  }
  & $bundledPython (Join-Path $PSScriptRoot "verify-desktop-python.py") --packages $packages --torch-home $torchHome
  if ($LASTEXITCODE -ne 0) { throw "Locked package/model validation failed." }
} finally {
  $env:PYTHONPATH = $oldPythonPath
  $env:PYTHONNOUSERSITE = $oldNoUserSite
  $env:TORCH_HOME = $oldTorchHome
  $env:PATH = $oldPath
}

# Preserve the previous working bundle and roll back both paths if promotion fails.
$previous = Join-Path $toolsRoot ("03_python_previous_" + [guid]::NewGuid().ToString("N"))
Assert-ToolsPath $previous
New-Item -ItemType Directory -Path $previous | Out-Null
$promoted = @()
$saved = @()
try {
  foreach ($name in @("python", "python-packages")) {
    $target = Join-Path $toolsRoot $name
    Assert-ToolsPath $target
    Assert-ToolsPath (Join-Path $previous $name)
    Assert-ToolsPath (Join-Path $stage $name)
    if (Test-Path -LiteralPath $target) {
      Move-Item -LiteralPath $target -Destination (Join-Path $previous $name)
      $saved += $name
    }
    Move-Item -LiteralPath (Join-Path $stage $name) -Destination $target
    $promoted += $name
  }
} catch {
  foreach ($name in $promoted) { Move-Item -LiteralPath (Join-Path $toolsRoot $name) -Destination (Join-Path $stage $name) }
  foreach ($name in $saved) { Move-Item -LiteralPath (Join-Path $previous $name) -Destination (Join-Path $toolsRoot $name) }
  throw
}
Write-Host "[bundle-tools] Locked bundle ready. Previous bundle: $previous"
Write-Host "[bundle-tools] Build evidence retained: $stage"
