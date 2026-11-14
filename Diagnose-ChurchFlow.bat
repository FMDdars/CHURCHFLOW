@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ChurchFlow Build Diagnostics

echo ==================================================
echo            CHURCHFLOW DIAGNOSTICS v0.8.0
echo ==================================================
echo.
echo Project folder: %CD%
echo.
echo [Windows]
ver
echo.
echo [Node.js]
where node 2>nul
if errorlevel 1 (echo Node.js: NOT FOUND) else (node -v & node -p "'Architecture: ' + process.arch")
echo.
echo [npm]
where npm 2>nul
if errorlevel 1 (echo npm: NOT FOUND) else (call npm -v)
echo.
echo [Project files]
if exist package.json (echo package.json: FOUND) else (echo package.json: MISSING)
if exist main.js (echo main.js: FOUND) else (echo main.js: MISSING)
if exist index.html (echo index.html: FOUND) else (echo index.html: MISSING)
if exist Build-ChurchFlow-Installer.bat (echo Builder: FOUND) else (echo Builder: MISSING)
if exist node_modules\electron\dist\electron.exe (echo Electron dependency: FOUND) else (echo Electron dependency: NOT INSTALLED)
if exist dist\ChurchFlow-Setup-0.8.0-x64.exe (echo Installer: FOUND) else (echo Installer: NOT BUILT YET)
echo.
echo Supported build versions: Node.js 24.x through 26.x, Windows x64.
echo If Node and npm are present, run Build-ChurchFlow-Installer.bat.
echo.
pause
