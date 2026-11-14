@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist "%~dp0ChurchFlow.exe" (
  start "" "%~dp0ChurchFlow.exe"
  exit /b 0
)
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24 LTS or 26 LTS is required to run this development package.
  echo The installed ChurchFlow Setup application does not require Node.js.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%m in ('node -p "process.versions.node"') do set NODE_MAJOR=%%m
if %NODE_MAJOR% LSS 24 (
  echo Please use Node.js 24.x through 26.x for this development package.
  pause
  exit /b 1
)
if %NODE_MAJOR% GEQ 27 (
  echo Please use Node.js 24.x through 26.x for this development package.
  pause
  exit /b 1
)
if not exist package.json (
  echo package.json is missing. Please extract the complete project ZIP.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing or repairing ChurchFlow dependencies...
  call npm install
  if errorlevel 1 goto failed
)
call npm run check
if errorlevel 1 goto failed
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo ChurchFlow did not start. Copy the error above when reporting the problem.
pause
exit /b 1
