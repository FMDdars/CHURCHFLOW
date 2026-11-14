# ChurchFlow NDI native bridge

The C++ addon sends the current ChurchFlow output frame through the official NDI Send API. It is intentionally excluded from a normal ready-to-install release until the SDK and local runtime are configured by the user.

## Build prerequisites

- Windows x64.
- Electron version pinned in the root `package.json` (v0.7.0 uses Electron 45.2.3).
- Node.js 24 LTS or 26 LTS.
- Visual Studio Build Tools with MSVC C++ workload.
- Official NDI SDK and its licence for your intended use.
- `NDI_SDK_DIR` set to the SDK root containing `Include`, `Lib`, and runtime `Bin` folders.

Run `Build-NDI-Module.bat` from the project root. It calls node-gyp against the Electron headers. Then run `Build-ChurchFlow-Installer.bat` to include the compiled addon and its runtime DLL.

The addon accepts RGBA pixels from the renderer, converts them to BGRA, stores the newest frame and sends it at 30 or 60 fps. The current implementation supports one NDI video source. It does not send audio, tally or return metadata, and has not yet been validated against the target production hardware.
