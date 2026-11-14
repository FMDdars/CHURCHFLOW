const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('churchflowDesktop', Object.freeze({
  getVersion: () => ipcRenderer.invoke('churchflow:app-version'),
  getUpdateState: () => ipcRenderer.invoke('churchflow:update-state'),
  checkForUpdates: () => ipcRenderer.invoke('churchflow:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('churchflow:download-update'),
  installUpdate: () => ipcRenderer.invoke('churchflow:install-update'),
  onUpdateStatus: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('churchflow:update-status', listener);
    return () => ipcRenderer.removeListener('churchflow:update-status', listener);
  },
  runDiagnostics: () => ipcRenderer.invoke('churchflow:diagnostics'),
  searchGospelHymns: (query) => ipcRenderer.invoke('churchflow:search-gospel-hymns', query),
  getGospelHymn: (number) => ipcRenderer.invoke('churchflow:get-gospel-hymn', number),
  setMusixmatchKey: (key) => ipcRenderer.invoke('churchflow:set-musixmatch-key', key),
  hasMusixmatchKey: () => ipcRenderer.invoke('churchflow:has-musixmatch-key'),
  searchMusixmatch: (query) => ipcRenderer.invoke('churchflow:search-musixmatch', query),
  getMusixmatchLyrics: (trackId) => ipcRenderer.invoke('churchflow:get-musixmatch-lyrics', trackId),
  getPdfJsPaths: () => ipcRenderer.invoke('churchflow:pdfjs-paths'),
  importPresentation: () => ipcRenderer.invoke('churchflow:import-presentation'),
  getPresentationPdf: (presentationId) => ipcRenderer.invoke('churchflow:get-presentation-pdf', presentationId),
  deletePresentation: (presentationId) => ipcRenderer.invoke('churchflow:delete-presentation', presentationId),
  ndiStart: (settings) => ipcRenderer.invoke('churchflow:ndi-start', settings),
  ndiSendFrame: (pixelData, width, height) => ipcRenderer.invoke('churchflow:ndi-frame', pixelData, width, height),
  ndiStop: () => ipcRenderer.invoke('churchflow:ndi-stop')
}));
