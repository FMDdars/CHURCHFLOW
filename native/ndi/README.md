# ChurchFlow NDI output

ChurchFlow builds its Windows NDI native addon against the NDI SDK headers and uses NDI's dynamic-loading API. It does not link against an NDI import library and does not bundle NDI runtime DLLs.

## Requirements

- Windows x64
- Node.js dependencies installed for this project
- Visual Studio Build Tools with the Desktop development with C++ workload (for local builds)
- Official NDI Runtime 6 installed on each computer that will send NDI

The native addon is built for the project's Electron version (45.2.3). The GitHub Actions Windows workflow builds it before packaging the installer and portable app.

## Local build

Run `Build-NDI-Module.bat` from the project folder. The script requires the Microsoft C++ compiler and downloads the matching Electron headers through node-gyp.

## Runtime loading

At startup, the addon searches the standard NDI Runtime 6 installation directory, `NDI_RUNTIME_DIR_V6`, the SDK's `Bin\x64` directory when `NDI_SDK_DIR` is set, and the normal Windows DLL search path. Install the official NDI Runtime separately if the library cannot be found.

## Licensing

The headers in `include/` retain Vizrt NDI AB's MIT license notices. That MIT permission applies to the header files only. It does not grant rights to redistribute the NDI runtime or other SDK binaries. ChurchFlow therefore does not include the runtime DLL or SDK import library. Review the current NDI SDK EULA and distribution requirements before distributing builds.
