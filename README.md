# ChurchFlow Desktop v0.8.0 — Windows installer and system diagnostics

ChurchFlow is an offline-first worship presentation application for Windows. It runs as its own Electron desktop application, with a separate audience output window for projectors and vMix capture.

## What's new in v0.8.0

## Node.js compatibility update (v0.8.0)

## Electron download retry (v0.8.0)

- The Windows builder first downloads Electron from the default source.
- If that download fails (for example, `ECONNRESET`), it automatically retries using the npmmirror Electron mirror.
- If both sources fail, the likely cause is network filtering, a proxy, or an unstable connection. Try again on a different trusted network; do not disable Windows security protections.


- Build scripts accept Node.js major versions 24, 25 and 26 on Windows x64.
- Node.js 24 and 26 LTS are preferred; Node.js 25 is accepted but is a non-LTS release.
- Node.js 26 is accepted so systems already using v26 do not have to downgrade just to pass the builder's version check.
- Acceptance by the version check does not guarantee every third-party native addon is compatible. If npm, Electron Builder or the optional NDI build reports an error, share the complete output.
- The Windows CI workflow builds on both Node.js 24 and 26.


### Updated desktop runtime

- Upgraded from Electron 39 to Electron 45.2.3, a current stable release at the time this package was prepared.
- Added a project check script and a Windows build workflow.
- Added a repeatable Windows x64 installer and portable-app build.
- Added a GitHub Actions Windows build workflow. It can build the installer on a Windows hosted runner and upload the two `.exe` files as workflow artifacts.

### System diagnostics

Open ChurchFlow → Broadcast output → **Run system checks**. The report checks:

- Whether ChurchFlow is running as an installed package or from source.
- Electron / Node versions and CPU architecture.
- PDF.js availability.
- Whether Microsoft PowerPoint or LibreOffice is detected for PowerPoint conversion.
- Whether the native NDI module and runtime DLL can be found and loaded.

The diagnostics are checks, not a substitute for testing the projector, vMix receiver, network and actual slide output in the church setup.

### PowerPoint and PDF import

- Import `.pptx` and `.pdf` files.
- For `.pptx`, ChurchFlow first tries Microsoft PowerPoint automation on Windows, then LibreOffice.
- PDF.js renders the converted slides in the operator preview and audience output.
- Presenter View shows current slide, next slide and speaker notes when extracted from the original `.pptx`.
- The source deck and converted PDF are saved in ChurchFlow's local application data folder.

**Compatibility limitation:** `.pptx` decks are flattened to PDF slides. Animations, transitions, embedded video/audio and live PowerPoint objects are not played as native PowerPoint elements. Conversion fidelity depends on PowerPoint/LibreOffice and fonts installed on the computer.

**PowerPoint requirement:** install Microsoft PowerPoint or LibreOffice to import `.pptx`. PDF import does not require either converter.

### Native NDI sender foundation

- C++/Node-API sender code is included under `native/ndi`.
- Configure the source name and choose 720p/1080p at 30/60 fps.
- Once built and loaded, it sends the current slide image as a BGRA video frame.
- The clean audience display window remains available as a fallback for vMix Desktop Capture.

**NDI is not enabled in the standard installer by default.** The `.node` module must be compiled against the official NDI SDK on Windows, and the NDI runtime DLL must be available. Use `Build-NDI-Module.bat`, then run `Build-ChurchFlow-Installer.bat` again. The module has not been verified against your particular NDI receiver, network or production hardware.

Review the current [NDI SDK licence and download terms](https://ndi.video/for-developers/ndi-sdk/download/) and [NDI Send API documentation](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-send). Do not redistribute SDK files unless the licence allows it.

### Lyrics providers

- Gospel Hymns & Songs provider for its published catalogue.
- Musixmatch adapter using an API key supplied by the user.
- The key is stored with Electron `safeStorage` on supported Windows systems.
- Full lyrics and the right to display, store or stream them depend on the provider plan and your church's licences. No provider is guaranteed to contain every gospel song ever written.

## Option A — Build the Windows installer on your computer

**Requirements:** Windows 10/11 x64, Node.js 24 LTS or 26 LTS, internet for dependency downloads. PowerPoint or LibreOffice is needed for `.pptx` conversion. The installed end-user app does not require Node.js.

1. Extract the entire ZIP into a normal folder.
2. Install the **Windows x64 Node.js 24 LTS or 26 LTS** release from the official Node.js download page.
3. Close any open Command Prompt windows and File Explorer windows, then open a new Command Prompt.
4. Run `node -v` and `npm -v`. The first command must show `v24.x.x` or `v26.x.x`; the second must print an npm version.
5. Double-click `Build-ChurchFlow-Installer.bat`. It installs dependencies and builds the app; it does **not** open ChurchFlow itself.
6. When the script reports `BUILD COMPLETE`, open `dist` and run `ChurchFlow-Setup-0.8.0-x64.exe` to install, or run `ChurchFlow-Portable-0.8.0-x64.exe` without installing.

If the script stops at the Node.js check, the build has not started. Install Node.js 24 LTS or 26 LTS x64, restart File Explorer (or sign out and back in if PATH is still not updated), and run the builder again. For a quick diagnosis, double-click `Diagnose-ChurchFlow.bat` and read the report.

The NSIS installer creates Start Menu and Desktop shortcuts. It supports a per-user install and does not need administrator permissions by default.

## Option B — Build the installer through GitHub Actions

A workflow is included at `.github/workflows/windows-installer.yml`.

1. Create a private GitHub repository for your ChurchFlow project.
2. Upload the extracted project folder to the repository.
3. Open the repository's **Actions** tab.
4. Select **Build ChurchFlow for Windows** and choose **Run workflow**.
5. Open the completed workflow run and download the ``ChurchFlow-Windows-x64-node24-v0.8.0` or `ChurchFlow-Windows-x64-node26-v0.8.0` (the workflow creates one artifact for each Node version)` artifact.
6. Extract that artifact to get the installer and portable `.exe`.

No signing certificate or GitHub secret is required for this unsigned test build. Windows SmartScreen may show an unknown-publisher warning until the application is code-signed and gains reputation. Do not bypass warnings on builds from sources you do not trust.

## Run from the source folder

For development only:

1. Install Node.js 24 LTS or 26 LTS.
2. Extract the ZIP.
3. Double-click `Start-ChurchFlow.bat`.

The first source launch runs `npm install`. Once packaged and installed, open ChurchFlow from its desktop or Start Menu shortcut.

## Build and enable native NDI

1. Install the official NDI SDK. Review its current licence and permitted use.
2. Install Visual Studio Build Tools and select **Desktop development with C++**.
3. Set `NDI_SDK_DIR` to the SDK directory. Example (adjust to the real SDK path):

   ```bat
   setx NDI_SDK_DIR "C:\Program Files\NDI\NDI 6 SDK"
   ```

4. Close and reopen Command Prompt / File Explorer so the environment variable is refreshed.
5. Double-click `Build-NDI-Module.bat`.
6. If it succeeds, run `Build-ChurchFlow-Installer.bat` again.
7. Start ChurchFlow → Broadcast output → Run system checks. Confirm that the NDI module loads.
8. Start native NDI output, then select the ChurchFlow source in an NDI receiver such as vMix.

If the SDK uses a different directory layout, update `native/ndi/binding.gyp` and the DLL copy paths in `Build-NDI-Module.bat`.

## Actual setup test checklist

The included diagnostics verify software prerequisites. These final tests must be performed on the actual Windows production computer and display/network setup:

- [ ] Install from `ChurchFlow-Setup-0.8.0-x64.exe` and launch from the Start Menu.
- [ ] Restart Windows and launch ChurchFlow again; confirm the song library and service order are still present.
- [ ] Import a PDF and a multi-slide `.pptx`; check slide count, fonts, images and notes.
- [ ] Open the audience output on the projector; confirm the output is clean and in the expected aspect ratio.
- [ ] Open vMix and add the ChurchFlow capture output; verify that slide changes appear only when sent live.
- [ ] If the NDI addon is built, use the ChurchFlow diagnostics and NDI receiver to confirm source discovery, stable frames and the selected resolution/frame rate.
- [ ] Test blackout, clear/restore, slide navigation and keyboard shortcuts while the operator continues editing.
- [ ] Confirm the setup still presents saved songs when the internet is disconnected.

## Known limitations

- This development environment is Linux and cannot run a Windows hardware acceptance test. The ZIP contains the build workflow and scripts; it does **not** contain a completed Windows installer.
- The GitHub Actions workflow produces an unsigned Windows test build and does not include the proprietary NDI SDK or NDI addon.
- Native NDI is not active until the module is compiled with the SDK on Windows and tested with a receiver.
- PowerPoint is currently flattened to PDF slides; no native PowerPoint animation or embedded video/audio playback.
- Multi-computer service synchronisation and multiple independent NDI sources are not implemented.
- Universal gospel lyrics coverage is not available; online catalogue coverage and lyric rights vary by provider.

## Project structure

- `main.js`: Electron main process, file import/conversion, lyrics provider requests, diagnostics and NDI bridge.
- `preload.js`: restricted IPC API exposed to the renderer.
- `src/app.js`: library, service order, live controls, PowerPoint Presenter View, lyrics and broadcast diagnostics.
- `src/styles.css`: interface styling.
- `display.html`: clean audience output window.
- `native/ndi`: C++ NDI sender bridge source.
- `.github/workflows/windows-installer.yml`: hosted Windows build pipeline.
- `scripts/check-project.cjs`: structural and syntax check.


## v0.8.0 updates

- Opening PowerPoint Presenter View now sends the selected slide to the audience output automatically.
- Presenter View Previous and Next buttons update the audience output immediately.
- Added GitHub Releases update checks, download progress, and user-approved installation.
- Update checks require a packaged installation and a published GitHub Release for `FMDdars/CHURCHFLOW`.
- For the built-in updater to work without an embedded secret, publish releases from a **public** GitHub repository. Private repositories require a separate authenticated update hosting design.

## Publishing an update

The GitHub release must include the electron-builder-generated `latest.yml`, installer, and blockmap assets. Build releases with `npm run dist:win:publish` in an environment authenticated to the repository. Do not put a GitHub token in the ChurchFlow application or commit it to source control.
