# Building the ChurchFlow NDI module (Windows x64)

ChurchFlow's NDI output uses a native Node.js addon. The addon is not built by the ordinary Windows installer workflow because the NDI SDK is a separately licensed developer dependency.

## Requirements

1. Install the official **NDI SDK for Windows x64** from https://ndi.video/for-developers/ndi-sdk/download/.
2. Install the matching **NDI Runtime** if it is not already installed. The SDK and runtime are separate from NDI Tools.
3. Install Node.js 24.x (the version used by this project).
4. Install Visual Studio Build Tools with the **Desktop development with C++** workload, including the MSVC x64 compiler and Windows SDK.
5. From the ChurchFlow project folder, run `npm install`.

## Build

Open **x64 Native Tools Command Prompt for Visual Studio**, change directory to the ChurchFlow project folder, and run:

```bat
native\ndi\Build-NDI-Module.bat
```

The script checks for the SDK headers and x64 import library, then builds:

```
native/ndi/build/Release/churchflow_ndi.node
```

The script detects the standard NDI 6 and NDI 5 SDK installation folders. If yours is installed elsewhere, it asks for the SDK folder path. You can also set `NDI_SDK_DIR` before running it.

## Runtime and packaging

The NDI Runtime DLL must be available to Windows when ChurchFlow loads the addon. Do not copy or redistribute SDK/runtime binaries unless the applicable NDI license explicitly permits it. The project packaging configuration unpacks a locally built `.node` addon, but the standard public release workflow does not build or bundle the proprietary SDK.

After building, launch ChurchFlow on the same PC and check its NDI diagnostics. Confirm that the native module loads and that the runtime DLL is detected before enabling NDI output.

## Troubleshooting

- **Missing header or import library:** verify that `NDI_SDK_DIR` points to the SDK root folder containing `Include` and `Lib\x64`.
- **MSVC not found:** rerun the batch file from the x64 Native Tools Command Prompt.
- **Module fails to load:** confirm that the NDI Runtime matching the SDK is installed and available on the Windows DLL search path.
