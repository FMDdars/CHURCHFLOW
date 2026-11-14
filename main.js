const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const APP_TITLE = 'ChurchFlow';
const GOSPEL_HYMNS_API = 'https://gospel-hymns.onrender.com/api/v1';
let mainWindow = null;
let ndiNative = null;
let ndiTimer = null;
let ndiHasFrame = false;
let ndiSettings = { name: 'ChurchFlow - Main Output', profile: '1080p · 30 fps' };
let updateState = { status: 'idle' };

function publishUpdateState(status, details = {}) {
  updateState = { status, ...details };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('churchflow:update-status', updateState);
}

autoUpdater.autoDownload = false;
// Updates install only after the operator explicitly chooses Restart and install.
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.on('checking-for-update', () => publishUpdateState('checking'));
autoUpdater.on('update-available', (info) => publishUpdateState('available', { version: info.version, releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '' }));
autoUpdater.on('update-not-available', (info) => publishUpdateState('current', { version: info.version }));
autoUpdater.on('download-progress', (progress) => publishUpdateState('downloading', { percent: Math.round(progress.percent || 0) }));
autoUpdater.on('update-downloaded', (info) => publishUpdateState('downloaded', { version: info.version }));
autoUpdater.on('error', (error) => publishUpdateState('error', { message: error?.message || 'Update check failed.' }));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    title: APP_TITLE,
    autoHideMenuBar: true,
    backgroundColor: '#0b101a',
    icon: path.join(__dirname, 'assets', 'churchflow.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'file:' && decodeURIComponent(target.pathname).toLowerCase().endsWith('/display.html')) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 1280,
            height: 720,
            minWidth: 640,
            minHeight: 360,
            autoHideMenuBar: true,
            backgroundColor: '#00000000',
            transparent: true,
            frame: false,
            webPreferences: {
              preload: path.join(__dirname, 'preload.js'),
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              webSecurity: true
            }
          }
        };
      }
      if (target.protocol === 'https:') shell.openExternal(url);
    } catch (error) {
      console.error('Blocked unsupported window URL:', error);
    }
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
  if (response.status === 429) throw new Error('The lyrics provider has reached its request limit. Please try again later.');
  if (!response.ok) throw new Error(`The online lyrics service returned HTTP ${response.status}.`);
  return response.json();
}

function safeId(value) {
  const id = String(value || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid presentation reference.');
  return id;
}

function importRoot() {
  return path.join(app.getPath('userData'), 'imports');
}

function findLibreOffice() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe')
      ]
    : ['/usr/bin/soffice', '/usr/local/bin/soffice'];
  return candidates.find((candidate) => fs.existsSync(candidate)) || (process.platform === 'win32' ? 'soffice.exe' : 'soffice');
}

async function convertWithPowerPoint(inputPath, outputPdf) {
  if (process.platform !== 'win32') return false;
  const input64 = Buffer.from(inputPath, 'utf8').toString('base64');
  const output64 = Buffer.from(outputPdf, 'utf8').toString('base64');
  const script = `$ErrorActionPreference='Stop'; $in=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${input64}')); $out=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${output64}')); $pp=$null; $deck=$null; try { $pp=New-Object -ComObject PowerPoint.Application; $deck=$pp.Presentations.Open($in,$true,$false,$false); $deck.SaveAs($out,32); $deck.Close(); $pp.Quit(); } catch { if($deck){$deck.Close()}; if($pp){$pp.Quit()}; throw };`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout: 90000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    return fs.existsSync(outputPdf);
  } catch {
    return false;
  }
}

async function convertWithLibreOffice(inputPath, outputDir, outputPdf) {
  const executable = findLibreOffice();
  const exportDir = path.join(outputDir, 'lo-export');
  await fsp.mkdir(exportDir, { recursive: true });
  const profilePath = path.join(exportDir, 'lo-profile').replace(/\\/g, '/');
  const profileUrl = pathToFileURL(profilePath).toString();
  await execFileAsync(executable, [
    '--headless', `-env:UserInstallation=${profileUrl}`,
    '--convert-to', 'pdf', '--outdir', exportDir, inputPath
  ], { timeout: 120000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const generatedPdf = path.join(exportDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
  if (!fs.existsSync(generatedPdf)) throw new Error('The presentation converter did not create a PDF file.');
  await fsp.copyFile(generatedPdf, outputPdf);
}

function extractPptxNotes(pptxPath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(pptxPath);
    const notes = {};
    const entries = zip.getEntries();
    for (const entry of entries) {
      const match = entry.entryName.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
      if (!match) continue;
      const notesNumber = match[1];
      const xml = entry.getData().toString('utf8');
      const relEntry = zip.getEntry(`ppt/notesSlides/_rels/notesSlide${notesNumber}.xml.rels`);
      let slideNumber = Number(notesNumber);
      if (relEntry) {
        const rels = relEntry.getData().toString('utf8');
        const slideRel = rels.match(/Type="[^"]*\/slide"[^>]*Target="\.\.\/slides\/slide(\d+)\.xml"/) || rels.match(/Target="\.\.\/slides\/slide(\d+)\.xml"[^>]*Type="[^"]*\/slide"/);
        if (slideRel) slideNumber = Number(slideRel[1]);
      }
      const paragraphs = [...xml.matchAll(/<a:p[\s\S]*?<\/a:p>/g)].map((paragraph) => {
        return [...paragraph[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map((part) => decodeXml(part[1])).join('');
      }).map((text) => text.trim()).filter((text) => text && !/^\d+$/.test(text));
      if (paragraphs.length) notes[slideNumber - 1] = paragraphs.join('\n');
    }
    return notes;
  } catch (error) {
    console.warn('PowerPoint notes could not be extracted:', error.message);
    return {};
  }
}

function decodeXml(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function importPresentation() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import a PowerPoint or PDF presentation',
    properties: ['openFile'],
    filters: [
      { name: 'Presentations', extensions: ['pptx', 'pdf'] },
      { name: 'PowerPoint files', extensions: ['pptx'] },
      { name: 'PDF files', extensions: ['pdf'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  if (!['.pptx', '.pdf'].includes(extension)) throw new Error('Please choose a .pptx or .pdf file.');

  const id = crypto.randomUUID();
  const targetDir = path.join(importRoot(), id);
  await fsp.mkdir(targetDir, { recursive: true });
  const pdfPath = path.join(targetDir, 'slides.pdf');
  let notes = {};
  let title = path.basename(sourcePath, extension);
  let originalName = path.basename(sourcePath);

  if (extension === '.pdf') {
    await fsp.copyFile(sourcePath, pdfPath);
  } else {
    const savedPptx = path.join(targetDir, 'original.pptx');
    await fsp.copyFile(sourcePath, savedPptx);
    notes = extractPptxNotes(savedPptx);
    const convertedByPowerPoint = await convertWithPowerPoint(savedPptx, pdfPath);
    if (!convertedByPowerPoint) {
      try {
        await convertWithLibreOffice(savedPptx, targetDir, pdfPath);
      } catch (error) {
        await fsp.rm(targetDir, { recursive: true, force: true });
        throw new Error(`ChurchFlow could not convert this PowerPoint. Install Microsoft PowerPoint or LibreOffice, then try again. Details: ${error.message}`);
      }
    }
  }

  return { id, title, originalName, notes, fileSize: (await fsp.stat(pdfPath)).size };
}

function findPowerPointExecutable() {
  if (process.platform !== 'win32') return null;
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    candidates.push(
      path.join(root, 'Microsoft Office', 'root', 'Office16', 'POWERPNT.EXE'),
      path.join(root, 'Microsoft Office', 'Office16', 'POWERPNT.EXE'),
      path.join(root, 'Microsoft Office', 'root', 'Office15', 'POWERPNT.EXE')
    );
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function commandExists(command, args = ['--version']) {
  try {
    await execFileAsync(command, args, { timeout: 5000, windowsHide: true, maxBuffer: 256 * 1024 });
    return true;
  } catch {
    return false;
  }
}

ipcMain.handle('churchflow:app-version', () => app.getVersion());
ipcMain.handle('churchflow:update-state', () => updateState);
ipcMain.handle('churchflow:check-for-updates', async () => {
  if (!app.isPackaged) return { status: 'development', message: 'Updates are checked in the installed application.' };
  publishUpdateState('checking');
  try { await autoUpdater.checkForUpdates(); return updateState; }
  catch (error) { publishUpdateState('error', { message: error.message }); return updateState; }
});
ipcMain.handle('churchflow:download-update', async () => {
  if (!app.isPackaged) throw new Error('Install ChurchFlow to download updates.');
  await autoUpdater.downloadUpdate();
  return updateState;
});
ipcMain.handle('churchflow:install-update', () => {
  if (updateState.status !== 'downloaded') throw new Error('The update has not finished downloading.');
  setImmediate(() => autoUpdater.quitAndInstall());
  return true;
});
ipcMain.handle('churchflow:diagnostics', async () => {
  const pdfjsAvailable = (() => { try { require.resolve('pdfjs-dist/build/pdf.mjs'); return true; } catch { return false; } })();
  const libreOfficeExplicit = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe')
      ].some((candidate) => fs.existsSync(candidate))
    : ['/usr/bin/soffice', '/usr/local/bin/soffice'].some((candidate) => fs.existsSync(candidate));
  const libreOfficeOnPath = libreOfficeExplicit || await commandExists(process.platform === 'win32' ? 'where.exe' : 'which', ['soffice']);
  const addonPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, ...(app.isPackaged ? ['app.asar.unpacked'] : []), 'native', 'ndi', 'build', 'Release', 'churchflow_ndi.node');
  const ndiModuleAvailable = Boolean(loadNdiAddon());
  const ndiDllCandidates = process.platform === 'win32' ? [
    path.join(path.dirname(addonPath), 'Processing.NDI.Lib.x64.dll'),
    path.join(process.env.NDI_SDK_DIR || '', 'Bin', 'x64', 'Processing.NDI.Lib.x64.dll'),
    path.join(process.env.NDI_SDK_DIR || '', 'Bin', 'Processing.NDI.Lib.x64.dll'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'Processing.NDI.Lib.x64.dll')
  ] : [];
  const ndiRuntimeOnPath = process.platform === 'win32'
    ? await commandExists('where.exe', ['Processing.NDI.Lib.x64.dll'])
    : false;
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron || 'unknown',
    nodeVersion: process.versions.node || 'unknown',
    platform: process.platform,
    architecture: process.arch,
    packaged: app.isPackaged,
    pdfjsAvailable,
    powerpointExecutableFound: Boolean(findPowerPointExecutable()),
    libreOfficeAvailable: Boolean(libreOfficeOnPath),
    ndiModuleFileFound: fs.existsSync(addonPath),
    ndiModuleLoads: ndiModuleAvailable,
    ndiRuntimeDllFound: ndiDllCandidates.some((candidate) => candidate && fs.existsSync(candidate)) || ndiRuntimeOnPath,
    openWindows: BrowserWindow.getAllWindows().length
  };
});
ipcMain.handle('churchflow:search-gospel-hymns', async (_event, query) => {
  const q = String(query || '').trim();
  if (q.length < 2) throw new Error('Enter at least two characters to search.');
  if (q.length > 100) throw new Error('Search text is too long.');
  const payload = await fetchJson(`${GOSPEL_HYMNS_API}/search/${encodeURIComponent(q)}`);
  if (payload?.success !== true || !Array.isArray(payload.data)) throw new Error('The hymn service returned an unexpected response.');
  return payload.data.slice(0, 40).map((item) => ({
    number: String(item.number || ''), id: String(item.number || ''), title: String(item.title || item.titleWithHymnNumber || 'Untitled hymn'),
    category: String(item.category || 'Hymn'), source: 'Gospel Hymns & Songs', provider: 'gospel-hymns',
    sourceUrl: `${GOSPEL_HYMNS_API}/hymn/${encodeURIComponent(String(item.number || ''))}`
  }));
});
ipcMain.handle('churchflow:get-gospel-hymn', async (_event, hymnNumber) => {
  const number = String(hymnNumber || '').trim();
  if (!/^\d{1,4}$/.test(number)) throw new Error('Invalid hymn number.');
  const payload = await fetchJson(`${GOSPEL_HYMNS_API}/hymn/${number}`);
  if (payload?.success !== true || !payload.data) throw new Error('This hymn could not be loaded from the online catalogue.');
  const hymn = payload.data;
  const parts = Array.isArray(hymn.verses) ? hymn.verses.map((v) => String(v || '').trim()).filter(Boolean) : [];
  let body = parts.join('\n---\n');
  if (hymn.chorus && typeof hymn.chorus === 'string') body += `${body ? '\n---\n' : ''}CHORUS\n${hymn.chorus.trim()}`;
  return { id: number, number, title: String(hymn.title || hymn.titleWithHymnNumber || `Hymn ${number}`), category: String(hymn.category || 'Hymn'), body, source: 'Gospel Hymns & Songs', provider: 'gospel-hymns', sourceUrl: `${GOSPEL_HYMNS_API}/hymn/${number}` };
});

ipcMain.handle('churchflow:search-lrclib', async (_event, query) => {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 100) throw new Error('Enter between 2 and 100 characters to search.');
  const url = new URL('https://lrclib.net/api/search');
  url.search = new URLSearchParams({ q }).toString();
  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'ChurchFlow/0.8.1 (https://github.com/FMDdars/CHURCHFLOW)' },
    signal: AbortSignal.timeout(18000)
  });
  if (response.status === 429) throw new Error('LRCLIB is receiving too many requests. Please wait a moment and try again.');
  if (!response.ok) throw new Error(`LRCLIB returned HTTP ${response.status}.`);
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error('LRCLIB returned an unexpected response.');
  return records.slice(0, 20).map((track) => ({
    id: String(track.id), number: '', title: String(track.trackName || track.name || 'Untitled track'),
    artist: String(track.artistName || 'Unknown artist'), category: 'Community lyrics catalogue',
    source: 'LRCLIB', provider: 'lrclib', sourceUrl: 'https://lrclib.net'
  }));
});
ipcMain.handle('churchflow:get-lrclib-lyrics', async (_event, trackId) => {
  const id = String(trackId || '').trim();
  if (!/^\d{1,12}$/.test(id)) throw new Error('Invalid LRCLIB track reference.');
  const response = await fetch(`https://lrclib.net/api/get/${id}`, {
    headers: { 'User-Agent': 'ChurchFlow/0.8.1 (https://github.com/FMDdars/CHURCHFLOW)' },
    signal: AbortSignal.timeout(18000)
  });
  if (response.status === 404) throw new Error('LRCLIB no longer has this lyrics record.');
  if (response.status === 429) throw new Error('LRCLIB is receiving too many requests. Please wait a moment and try again.');
  if (!response.ok) throw new Error(`LRCLIB returned HTTP ${response.status}.`);
  const track = await response.json();
  const synced = String(track.syncedLyrics || '');
  const plain = String(track.plainLyrics || '');
  const body = plain.trim() || synced.split('\n').map((line) => line.replace(/^\s*\[[0-9:.]+\]\s*/, '')).filter(Boolean).join('\n').trim();
  if (!body) throw new Error('No plain or synced lyrics are available for this track.');
  return {
    id, title: String(track.trackName || track.name || 'Untitled track'),
    body, source: 'LRCLIB', provider: 'lrclib', sourceUrl: 'https://lrclib.net'
  };
});


ipcMain.handle('churchflow:search-lrc-red', async (_event, query) => {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 100) throw new Error('Enter between 2 and 100 characters to search.');
  const url = new URL('https://lrc.red/search.json');
  url.search = new URLSearchParams({ q }).toString();
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'ChurchFlow/0.8.1 (https://github.com/FMDdars/CHURCHFLOW)',
      'X-Client-ID': 'ChurchFlow/0.8.1 (https://github.com/FMDdars/CHURCHFLOW/issues)'
    },
    signal: AbortSignal.timeout(18000)
  });
  if (response.status === 429) throw new Error('lrc.red is receiving too many requests. Please wait a moment and try again.');
  if (!response.ok) throw new Error(`lrc.red returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (!Array.isArray(payload?.hits)) throw new Error('lrc.red returned an unexpected response.');
  return payload.hits.slice(0, 30).filter((track) => /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/i.test(String(track.isrc || ''))).map((track) => {
    const isrc = String(track.isrc).toUpperCase();
    return {
      id: isrc, isrc, number: '', title: String(track.title || 'Untitled track'),
      artist: String(track.artist || 'Unknown artist'), category: String(track.album || 'Track'),
      source: 'lrc.red', provider: 'lrc-red', sourceUrl: `https://lrc.red/s/${isrc}`
    };
  });
});

ipcMain.handle('churchflow:get-lrc-red-lyrics', async (_event, trackIsrc) => {
  const isrc = String(trackIsrc || '').trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc)) throw new Error('Invalid lrc.red track reference.');
  const headers = {
    'User-Agent': 'ChurchFlow/0.8.1 (https://github.com/FMDdars/CHURCHFLOW)',
    'X-Client-ID': 'ChurchFlow/0.8.1 (https://github.com/FMDdars/CHURCHFLOW/issues)'
  };
  const metadataResponse = await fetch(`https://lrc.red/s/${isrc}.json`, {
    headers, signal: AbortSignal.timeout(18000)
  });
  if (metadataResponse.status === 404) throw new Error('lrc.red does not have a lyrics record for this track.');
  if (metadataResponse.status === 429) throw new Error('lrc.red is receiving too many requests. Please wait a moment and try again.');
  if (!metadataResponse.ok) throw new Error(`lrc.red returned HTTP ${metadataResponse.status}.`);
  const track = await metadataResponse.json();
  const files = track?.files || {};
  let body = '';

  if (typeof files.lrc === 'string') {
    try {
      const url = new URL(files.lrc);
      if (url.origin === 'https://lrc.red') {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(18000) });
        if (response.ok) {
          const lrc = await response.text();
          body = lrc.split(/\r?\n/).map((line) =>
            line.replace(/^(?:\s*\[[0-9:.]+\])+\s*/, '').trim()
          ).filter((line) => line && !/^\[[a-z]{2,}:/i.test(line)).join('\n').trim();
        }
      }
    } catch (error) {
      console.warn('Could not read lrc.red LRC file; trying TTML:', error.message);
    }
  }

  if (!body && typeof files.ttml === 'string') {
    const url = new URL(files.ttml);
    if (url.origin !== 'https://lrc.red') throw new Error('lrc.red returned an unsupported lyrics URL.');
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(18000) });
    if (response.status === 429) throw new Error('lrc.red is receiving too many requests. Please wait a moment and try again.');
    if (response.ok) {
      const xml = await response.text();
      const decode = (value) => value
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
      const paragraphs = [...xml.matchAll(/<p\b[^>]*>([\s\S]*?)<[/]p>/gi)].map((match) =>
        decode(match[1].replace(/<br[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')).trim()
      ).filter(Boolean);
      body = paragraphs.join('\n');
      if (!body) body = decode(xml.replace(/<br[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')).trim();
    }
  }

  if (!body) throw new Error('No readable lyrics file is available for this lrc.red track.');
  return {
    id: isrc, isrc, title: String(track.title || 'Untitled track'),
    artist: String(track.artist || 'Unknown artist'), body,
    source: 'lrc.red', provider: 'lrc-red', sourceUrl: `https://lrc.red/s/${isrc}`
  };
});

ipcMain.handle('churchflow:pdfjs-paths', () => ({
  moduleUrl: pathToFileURL(require.resolve('pdfjs-dist/build/pdf.mjs')).toString(),
  workerUrl: pathToFileURL(require.resolve('pdfjs-dist/build/pdf.worker.mjs')).toString()
}));
ipcMain.handle('churchflow:import-presentation', async () => importPresentation());
ipcMain.handle('churchflow:get-presentation-pdf', async (_event, presentationId) => {
  const id = safeId(presentationId);
  const pdfPath = path.join(importRoot(), id, 'slides.pdf');
  const contents = await fsp.readFile(pdfPath);
  return { name: path.basename(pdfPath), data: contents.toString('base64') };
});
ipcMain.handle('churchflow:delete-presentation', async (_event, presentationId) => {
  const id = safeId(presentationId);
  await fsp.rm(path.join(importRoot(), id), { recursive: true, force: true });
  return true;
});

function loadNdiAddon() {
  if (ndiNative) return ndiNative;
  const addonRelativePath = path.join('native', 'ndi', 'build', 'Release');
  const addonDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', addonRelativePath)
    : path.join(__dirname, addonRelativePath);
  const addonPath = path.join(addonDirectory, 'churchflow_ndi.node');
  if (!fs.existsSync(addonPath)) return null;
  try {
    // Windows must be able to resolve the NDI runtime DLL beside the native addon.
    if (process.platform === 'win32') {
      process.env.PATH = `${addonDirectory}${path.delimiter}${process.env.PATH || ''}`;
    }
    ndiNative = require(addonPath);
    return ndiNative;
  } catch (error) {
    console.error('NDI native module failed to load:', error);
    return null;
  }
}

ipcMain.handle('churchflow:ndi-start', async (_event, settings) => {
  const addon = loadNdiAddon();
  if (!addon) throw new Error('Native NDI is not built yet. Install the official NDI SDK, set NDI_SDK_DIR, then run Build-NDI-Module.bat. Desktop Capture remains available in the meantime.');
  const allowedProfiles = ['1080p · 30 fps', '1080p · 60 fps', '720p · 30 fps', '720p · 60 fps'];
  const requestedProfile = String(settings?.profile || '1080p · 30 fps');
  if (!allowedProfiles.includes(requestedProfile)) throw new Error('Choose a supported NDI output profile.');
  ndiSettings = {
    name: String(settings?.name || 'ChurchFlow - Main Output').trim().slice(0, 100) || 'ChurchFlow - Main Output',
    profile: requestedProfile
  };
  if (ndiTimer) clearInterval(ndiTimer);
  ndiTimer = null;
  ndiHasFrame = false;
  const started = addon.initialize(ndiSettings.name);
  if (!started) throw new Error('The NDI SDK could not initialize. Check that the NDI Runtime is installed.');
  const fps = ndiSettings.profile.includes('60 fps') ? 60 : 30;
  ndiTimer = setInterval(() => {
    if (!ndiHasFrame || !ndiNative) return;
    try { ndiNative.sendFrame(fps); }
    catch (error) { console.error('NDI frame send failed:', error); }
  }, Math.round(1000 / fps));
  if (ndiTimer.unref) ndiTimer.unref();
  return { started: true, sourceName: ndiSettings.name, fps };
});
ipcMain.handle('churchflow:ndi-frame', (_event, pixelData, width, height) => {
  if (!ndiTimer || !ndiNative) return false;
  if (!(pixelData instanceof Uint8Array) && !Buffer.isBuffer(pixelData)) throw new Error('Invalid NDI frame buffer.');
  const w = Number(width); const h = Number(height);
  const validDimensions = (w === 1280 && h === 720) || (w === 1920 && h === 1080);
  if (!validDimensions || pixelData.byteLength !== w * h * 4) {
    throw new Error('NDI frame dimensions do not match the selected output profile.');
  }
  const stored = ndiNative.setFrame(Buffer.from(pixelData), w, h);
  ndiHasFrame = stored === true;
  return ndiHasFrame;
});
ipcMain.handle('churchflow:ndi-stop', () => {
  if (ndiTimer) clearInterval(ndiTimer);
  ndiTimer = null;
  ndiHasFrame = false;
  if (ndiNative) { try { ndiNative.close(); } catch (error) { console.error(error); } }
  return true;
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  createWindow();
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch((error) => publishUpdateState('error', { message: error.message })), 5000);
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  if (ndiTimer) clearInterval(ndiTimer);
  if (ndiNative) { try { ndiNative.close(); } catch { /* exiting */ } }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
