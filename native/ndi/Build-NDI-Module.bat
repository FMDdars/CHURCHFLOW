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
  echo Install the ChurchFlow dependencies first.
  pause
  exit /b 1
)
if not exist "native\ndi\include\Processing.NDI.Lib.h" (
  echo [ERROR] The bundled MIT-licensed NDI headers are missing.
  pause
  exit /b 1
)
where cl.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Visual C++ compiler was not found on PATH.
  echo Install Visual Studio Build Tools with the Desktop development with C++ workload.
  echo Then run this file from the x64 Native Tools Command Prompt.
  pause
  exit /b 1
)

echo Building ChurchFlow's NDI addon with dynamic runtime loading...
call node_modules\.bin\node-gyp.cmd rebuild --directory native\ndi --arch=x64 --target=45.2.3 --dist-url=https://electronjs.org/headers
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
echo [SUCCESS] ChurchFlow NDI module built.
echo The official NDI Runtime 6 must be installed separately on each computer.
echo No NDI runtime DLL or import library is bundled by this build.
pause
exit /b 0
