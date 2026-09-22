@echo off
setlocal
cd /d "%~dp001-project\breathe-city"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Prepare Node.js 22.16.0 or newer and try again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22||(a===22&&b<16)){console.error('Node.js 22.16.0 or newer is required.');process.exit(1);}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Breathe City: http://localhost:3000 -- default configuration
echo Stop: Ctrl+C
node server/index.mjs
if errorlevel 1 pause
