@echo off
setlocal
title Build ChurchFlow NDI Module

cd /d "%~dp0\..\.."
if errorlevel 1 (
  echo [ERROR] Could not locate the ChurchFlow project folder.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo       ChurchFlow - NDI Module Builder
echo ==========================================
echo.

if not exist "node_modules\node-gyp\bin\node-gyp.js" (
  echo [ERROR] Project dependencies are missing.
  echo Open a terminal in the ChurchFlow folder and run: npm install
  pause
  exit /b 1
)

if "%NDI_SDK_DIR%"=="" (
  if exist "%ProgramFiles%\NDI\NDI 6 SDK\Include\Processing.NDI.Lib.h" (
    set "NDI_SDK_DIR=%ProgramFiles%\NDI\NDI 6 SDK"
  ) else (
    if exist "%ProgramFiles%\NDI\NDI 5 SDK\Include\Processing.NDI.Lib.h" (
      set "NDI_SDK_DIR=%ProgramFiles%\NDI\NDI 5 SDK"
    )
  )
)

if "%NDI_SDK_DIR%"=="" (
  echo [ERROR] NDI SDK was not found in the usual installation folders.
  echo.
  set /p NDI_SDK_DIR=Enter the full NDI SDK folder path: 
)

if not exist "%NDI_SDK_DIR%\Include\Processing.NDI.Lib.h" (
  echo [ERROR] Could not find Include\Processing.NDI.Lib.h in:
  echo "%NDI_SDK_DIR%"
  echo Check the SDK folder path and try again.
  pause
  exit /b 1
)

if not exist "%NDI_SDK_DIR%\Lib\x64\Processing.NDI.Lib.x64.lib" (
  echo [ERROR] Could not find the 64-bit NDI import library:
  echo "%NDI_SDK_DIR%\Lib\x64\Processing.NDI.Lib.x64.lib"
  echo Make sure the Windows x64 NDI SDK is installed.
  pause
  exit /b 1
)

where cl.exe >nul 2>nul
if errorlevel 1 (
  echo [WARNING] Visual C++ compiler was not found on PATH.
  echo Install Visual Studio Build Tools with the Desktop development with C++ workload,
  echo then run this file from the "x64 Native Tools Command Prompt".
  pause
  exit /b 1
)

set "NDI_SDK_DIR=%NDI_SDK_DIR%"
echo Using NDI SDK: "%NDI_SDK_DIR%"
echo Building the x64 native module for Electron...
echo.

call node_modules\.bin\node-gyp.cmd rebuild --directory native\ndi --arch=x64
if errorlevel 1 (
  echo.
  echo [ERROR] NDI module build failed. Review the compiler output above.
  pause
  exit /b 1
)

if not exist "native\ndi\build\Release\churchflow_ndi.node" (
  echo [ERROR] Build completed but churchflow_ndi.node was not created.
  pause
  exit /b 1
)

echo.
echo [SUCCESS] ChurchFlow NDI module built:
echo native\ndi\build\Release\churchflow_ndi.node
echo.
echo NOTE: The NDI Runtime must also be installed on this PC.
echo The SDK and runtime are subject to NDI's license terms.
pause
exit /b 0
