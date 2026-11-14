# ChurchFlow

ChurchFlow is an offline-first Windows worship presentation application. It provides a local song and slide library, service order, audience display windows, PowerPoint/PDF presentation import, Presenter View, clean capture output, lyrics search through Gospel Hymns & Songs, LRCLIB and lrc.red, transparent lower-thirds lyrics output, and an optional native NDI sender.

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

Set `NDI_SDK_DIR` to the SDK root, then run `Build-NDI-Module.bat` from the project root. The script builds the addon under `native/ndi`. After a successful build, run `Build-ChurchFlow-Installer.bat` to package it. Clean capture output remains available without the NDI addon. Lyrics can be shown full-screen or as a transparent lower-third overlay; for alpha-capable vMix workflows, use NDI after building and testing the optional NDI addon. Ordinary desktop capture may flatten transparency. Lyrics access and projection/storage rights depend on the provider's terms and the church's licence.

NDI functionality must be tested on the target Windows system and with the intended receiver before production use.

## Online lyrics

The Online lyrics tab searches all online sources together: **Gospel Hymns & Songs**, **LRCLIB**, **lrc.red**, and **Lyrics.ovh**. Results identify their source so the operator can choose the matching song. ChurchFlow also checks the **Better Lyrics** cache for matching tracks discovered by the other providers; its API does not provide a general song-search endpoint, and uncached requests may require an API key that is not currently being issued. **OpenLyrics** is supported as an offline import format: import individual XML files or ZIP collections containing OpenLyrics XML songs. Imported songs are searchable in the local library. LRCLIB is a free community-maintained API; lrc.red requires app identification and visible credit; Lyrics.ovh provides song suggestions and lyrics retrieval; Better Lyrics serves cached timed lyrics without a key but may not return uncached songs. Provider availability and coverage vary. Before importing or projecting online lyrics, confirm that your church has permission or that the work is public domain; API access does not grant projection or offline-storage rights. See the [LRCLIB API documentation](https://lrclib.net/docs), [lrc.red API documentation](https://lrc.red/api), [Lyrics.ovh API](https://github.com/NTag/lyrics.ovh), [Better Lyrics API documentation](https://docs.betterlyrics.org/), and [OpenLyrics format documentation](https://docs.openlyrics.org/en/latest/).
