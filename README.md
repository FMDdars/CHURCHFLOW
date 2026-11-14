# ChurchFlow

ChurchFlow is an offline-first Windows worship presentation application. It provides a local song and slide library, service order, audience display windows, PowerPoint/PDF presentation import, Presenter View, clean capture output, lyrics search (including LRCLIB when configured), transparent lower-thirds lyrics output, and an optional native NDI sender.

## Build on Windows

- Windows x64
- Node.js 24.x or 26.x (x64)
- npm
- Internet access for dependency and Electron downloads

1. Extract the complete repository.
2. Run `Build-ChurchFlow-Installer.bat`.
3. When the build completes, open the `dist` folder and run the ChurchFlow installer.

The build script runs `npm run check` before creating the installer and portable build. The project check validates required files and JavaScript syntax.

## Presenter View

Presenter View follows the currently live slide when the selected PowerPoint presentation is already on air. Opening Presenter View does not send a preview slide to the audience. Previous/Next navigate the live presentation; **Send selected live** is the explicit action for putting a selected preview on air.

## Updates

Installed builds check GitHub Releases at startup. Operators can also select **Check for updates**. Updates are downloaded only after the operator chooses **Download update**, and installed only after **Restart and install** is selected. A published GitHub Release with the matching version and Windows assets is required.

## Optional NDI output

The C++ NDI addon is optional. Building it requires the official NDI SDK and licence for the intended use, Windows x64, Visual Studio Build Tools with the MSVC C++ workload, and Node.js 24.x–26.x.

Set `NDI_SDK_DIR` to the SDK root, then run `Build-NDI-Module.bat` from the project root. The script builds the addon under `native/ndi`. After a successful build, run `Build-ChurchFlow-Installer.bat` to package it. Clean capture output remains available without the NDI addon. Lyrics can be shown full-screen or as a transparent lower-third overlay; for alpha-capable vMix workflows, use NDI after building and testing the optional NDI addon. Ordinary desktop capture may flatten transparency. The LRCLIB API key is entered in ChurchFlow's Online lyrics tab and stored using Windows secure storage. Lyrics access and projection/storage rights depend on the provider plan and licence.

NDI functionality must be tested on the target Windows system and with the intended receiver before production use.

## Online lyrics

The Online lyrics tab includes LRCLIB, a free community-maintained lyrics API that requires no API key or account. Search by song title, artist or keywords. LRCLIB may not contain every track, and requests are subject to its rate limits. ChurchFlow identifies itself in API requests and handles rate-limit responses. Before importing or projecting lyrics, confirm that your church has the necessary permission or that the work is public domain; an API listing does not grant projection or offline-storage rights. See the [LRCLIB API documentation](https://lrclib.net/docs).
