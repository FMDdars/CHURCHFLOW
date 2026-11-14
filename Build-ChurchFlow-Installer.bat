@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ChurchFlow Windows Installer Builder

echo ==================================================
echo          CHURCHFLOW WINDOWS BUILD v0.9.0
echo ==================================================
echo.
echo This script BUILDS the installer. It does not launch
 echo the application. After a successful build, install it
 echo from the dist folder.
echo.
where node >nul 2>&1
if errorlevel 1 goto no_node
where npm >nul 2>&1
if errorlevel 1 goto no_npm
for /f "delims=" %%v in ('node -p "process.versions.node" 2^>nul') do set "NODE_VERSION=%%v"
for /f "delims=" %%a in ('node -p "process.arch" 2^>nul') do set "NODE_ARCH=%%a"
if not defined NODE_VERSION goto no_node
for /f "tokens=1 delims=." %%m in ("%NODE_VERSION%") do set "NODE_MAJOR=%%m"
echo Detected Node.js: v%NODE_VERSION% (%NODE_ARCH%)
if %NODE_MAJOR% LSS 24 goto unsupported_node
if %NODE_MAJOR% GEQ 27 goto unsupported_node
if not "%NODE_ARCH%"=="x64" goto wrong_arch
if "%NODE_MAJOR%"=="26" echo NOTE: Node.js 26 is accepted. If a dependency reports a compatibility error, share the complete error text.
if "%NODE_MAJOR%"=="25" echo WARNING: Node.js 25 is non-LTS. Node.js 24 or 26 LTS is preferred.
echo.
echo Checking npm...
call npm --version
if errorlevel 1 goto no_npm
if not exist package.json (
  echo ERROR: package.json is missing. Extract the COMPLETE ChurchFlow ZIP.
  goto failed
)
echo.
echo [1/3] Installing project dependencies. Internet access is required.
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo.
echo [2/3] Checking ChurchFlow project files.
call npm run check
if errorlevel 1 goto failed
echo.
echo [3/3] Building Windows installer and portable application.
echo First trying the official Electron download source...
call npm run dist:win
if not errorlevel 1 goto verify_build

echo.
echo The direct Electron download failed. This can happen when a network
 echo resets or blocks the GitHub download connection (ECONNRESET).
echo Retrying with the npmmirror Electron mirror...
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
call npm run dist:win
if errorlevel 1 goto failed

:verify_build
if not exist "dist\ChurchFlow-Setup-0.9.0-x64.exe" (
  echo ERROR: The installer file was not found after the build.
  echo Check the electron-builder output above and the dist folder.
  goto failed
)
echo.
echo ==================================================
echo BUILD COMPLETE
echo ==================================================
echo Installer: %CD%\dist\ChurchFlow-Setup-0.9.0-x64.exe
echo Portable:  %CD%\dist\ChurchFlow-Portable-0.9.0-x64.exe
echo Opening the dist folder now...
start "" explorer "%CD%\dist"
echo Run ChurchFlow-Setup-0.9.0-x64.exe to install ChurchFlow.
echo.
pause
exit /b 0
:no_node
echo ERROR: Node.js was not found in Windows PATH.
echo Install Node.js 24 LTS or 26 LTS for Windows x64 from:
echo https://nodejs.org/en/download
start "" "https://nodejs.org/en/download"
goto failed
:no_npm
echo ERROR: npm was not found. Repair or reinstall Node.js for Windows x64.
start "" "https://nodejs.org/en/download"
goto failed
:unsupported_node
echo ERROR: ChurchFlow supports Node.js 24.x through 26.x.
echo Your detected version is v%NODE_VERSION%.
echo Install Node.js 24 LTS or 26 LTS x64, then try again.
start "" "https://nodejs.org/en/download"
goto failed
:wrong_arch
echo ERROR: This project creates x64 Windows installers, but Node reports %NODE_ARCH%.
echo Install the x64 version of Node.js.
goto failed
:failed
echo.
echo BUILD FAILED.
echo If both Electron download sources fail, your network may block the download.
echo Try a different network or temporarily disable VPN/proxy filtering if your
 echo network administrator permits it. Do not disable Windows security protections.
echo No installer was created by this run.
echo For diagnosis, double-click Diagnose-ChurchFlow.bat and share its report.
echo.
pause
exit /b 1
