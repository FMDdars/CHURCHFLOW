@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ================================================
echo        ChurchFlow native NDI build v0.8.0
echo ================================================
echo.
if "%NDI_SDK_DIR%"=="" (
  echo ERROR: NDI_SDK_DIR is not set.
  echo Install the official NDI SDK and set NDI_SDK_DIR to its folder.
  echo Example: setx NDI_SDK_DIR "C:\Program Files\NDI\NDI 6 SDK"
  pause
  exit /b 1
)
if not exist "%NDI_SDK_DIR%\Include\Processing.NDI.Lib.h" (
  echo ERROR: Processing.NDI.Lib.h was not found under:
  echo %NDI_SDK_DIR%\Include
  pause
  exit /b 1
)
if not exist "%NDI_SDK_DIR%\Lib\x64\Processing.NDI.Lib.x64.lib" (
  echo ERROR: The NDI x64 import library was not found under:
  echo %NDI_SDK_DIR%\Lib\x64
  pause
  exit /b 1
)
where cl >nul 2>&1
if errorlevel 1 (
  echo ERROR: MSVC C++ compiler was not found.
  echo Install Visual Studio Build Tools with the Desktop development with C++ workload.
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js 24.x through 26.x is required.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%m in ('node -p "process.versions.node"') do set NODE_MAJOR=%%m
if %NODE_MAJOR% LSS 24 (
  echo ERROR: Use Node.js 24.x through 26.x to build for this Electron version.
  pause
  exit /b 1
)
if %NODE_MAJOR% GEQ 27 (
  echo ERROR: Use Node.js 24.x through 26.x to build for this Electron version.
  pause
  exit /b 1
)

if not exist package.json goto failed
if not exist node_modules (
  echo Installing ChurchFlow dependencies...
  call npm install
  if errorlevel 1 goto failed
)
set ELECTRON_VERSION=
for /f %%v in ('node -p "require(""electron/package.json"").version"') do set ELECTRON_VERSION=%%v
if "%ELECTRON_VERSION%"=="" goto failed

echo Building NDI addon for Electron %ELECTRON_VERSION%...
pushd native\ndi
call npx node-gyp rebuild --target=%ELECTRON_VERSION% --dist-url=https://electronjs.org/headers --arch=x64
if errorlevel 1 (popd & goto failed)
popd

if not exist "native\ndi\build\Release\churchflow_ndi.node" goto failed
if exist "%NDI_SDK_DIR%\Bin\x64\Processing.NDI.Lib.x64.dll" (
  copy /Y "%NDI_SDK_DIR%\Bin\x64\Processing.NDI.Lib.x64.dll" "native\ndi\build\Release\" >nul
) else if exist "%NDI_SDK_DIR%\Bin\Processing.NDI.Lib.x64.dll" (
  copy /Y "%NDI_SDK_DIR%\Bin\Processing.NDI.Lib.x64.dll" "native\ndi\build\Release\" >nul
) else (
  echo WARNING: NDI runtime DLL was not found in the usual SDK Bin folders.
  echo The module may fail to load unless the NDI Runtime is installed system-wide.
)

echo.
echo NDI module build succeeded.
echo Now run Build-ChurchFlow-Installer.bat to include it in the installed app.
pause
exit /b 0

:failed
echo.
echo NDI build failed. Check NDI_SDK_DIR, SDK version, Node.js and C++ Build Tools.
pause
exit /b 1
