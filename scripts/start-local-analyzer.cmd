@echo off
setlocal

set "ROOT=%~dp0.."
pushd "%ROOT%" >nul

set "NODE=node"
for /d %%D in ("%ROOT%\tools\node-*-win-x64") do set "NODE=%%~fD\node.exe"

if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js was not found.
    echo Install Node.js or run the project setup first.
    pause
    exit /b 1
  )
  set "NODE=node"
)

if not exist "%ROOT%\server\node_modules\ffmpeg-static" (
  echo Server dependencies are missing.
  echo Run scripts\install-analysis-tools.ps1 first, then start this file again.
  pause
  exit /b 1
)

set "HOST=127.0.0.1"
set "PORT=8787"
set "MEFX_AUTO_SHUTDOWN=1"
set "MEFX_IDLE_TIMEOUT_MS=60000"
set "MEFX_CLOSE_GRACE_MS=12000"

cd /d "%ROOT%\server"
echo Starting MEFX local analyzer on http://127.0.0.1:8787/health
echo Close the web page to let this server exit automatically.
"%NODE%" "src\server.js"

popd >nul
endlocal
