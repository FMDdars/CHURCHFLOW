const $ = (selector) => document.querySelector(selector);

const starter = [
  { id: 's1', type: 'song', title: 'Great Is Thy Faithfulness', body: 'Great is Thy faithfulness, O God my Father\nThere is no shadow of turning with Thee\n---\nThou changest not, Thy compassions, they fail not\nAs Thou hast been, Thou forever wilt be' },
  { id: 's2', type: 'song', title: 'How Great Thou Art', body: 'O Lord my God, when I in awesome wonder\nConsider all the worlds Thy hands have made\n---\nThen sings my soul, my Saviour God, to Thee\nHow great Thou art, how great Thou art' },
  { id: 'p1', type: 'slide', title: 'Welcome & Announcements', body: "WELCOME TO WORSHIP\nWe are glad you are here.\n---\nCHURCH ANNOUNCEMENTS\nPlease take note of this week's activities." }
];

let data = load();
let tab = 'songs';
let selected = null;
let slideIndex = 0;
let liveIndex = 0;
let liveBlank = false;
let liveItem = null;
let displayWindows = [];
let editingId = null;
let onlineResults = [];
let loadedOnlineHymn = null;
let pdfjsPromise = null;
const presentationDocs = new Map();
let ndiActive = false;

function defaultData() {
  return { items: starter, service: ['s1', 'p1'], ndi: { name: 'ChurchFlow - Main Output', profile: '1080p · 30 fps' } };
}

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem('churchflow-data'));
    if (!stored || !Array.isArray(stored.items)) return defaultData();
    return { ...defaultData(), ...stored, items: stored.items, service: Array.isArray(stored.service) ? stored.service : [] };
  } catch { return defaultData(); }
}

function save() {
  localStorage.setItem('churchflow-data', JSON.stringify(data));
  $('#saveStatus').textContent = 'Saved locally';
}

function slides(item) {
  if (item?.type === 'presentation') return Array.from({ length: Math.max(1, Number(item.slideCount) || 1) }, (_, index) => `Slide ${index + 1}`);
  return (item?.body || '').split(/\n---\n/g).map((part) => part.trim()).filter(Boolean);
}

function current() { return data.items.find((item) => item.id === selected) || null; }
function normalize(value) {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

function searchScore(item, queryText) {
  const query = normalize(queryText);
  if (!query) return 1;
  const title = normalize(item.title);
  const body = normalize(item.body);
  const all = `${title} ${body}`;
  if (title.includes(query)) return 100;
  if (all.includes(query)) return 85;
  const words = query.split(' ');
  let hits = 0;
  for (const word of words) {
    if (!word) continue;
    const titleWords = title.split(' ');
    const bodyWords = body.split(' ');
    const found = titleWords.some((candidate) => candidate.includes(word) || editDistance(word, candidate) <= Math.max(1, Math.floor(word.length * 0.25)))
      || bodyWords.some((candidate) => candidate.includes(word));
    if (found) hits += 1;
  }
  return (hits / Math.max(1, words.length)) * 70;
}

function renderLibrary() {
  const query = $('#search').value;
  const library = $('#libraryList');
  library.innerHTML = '';
  const online = tab === 'online';
  $('#onlineStatus').hidden = !online;
  $('#onlineSearchButton').hidden = !online;
  $('#onlineProviderTools').hidden = !online;
  $('#libraryFooter').hidden = online;
  $('#search').placeholder = online ? 'Search online lyrics…' : tab === 'presentations' ? 'Search imported presentations…' : 'Search songs and slides…';
  if (online) { renderOnlineResults(); return; }

  const typeForTab = { songs: 'song', slides: 'slide', presentations: 'presentation' }[tab] || 'song';
  data.items
    .filter((item) => item.type === typeForTab)
    .map((item) => ({ item, score: searchScore(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .forEach(({ item }) => {
      const element = document.createElement('div');
      element.className = `library-item${item.id === selected ? ' selected' : ''}`;
      const title = document.createElement('div'); title.className = 'item-title'; title.textContent = item.title;
      const meta = document.createElement('div'); meta.className = 'item-sub';
      if (item.type === 'presentation') meta.textContent = `POWERPOINT / PDF · ${item.slideCount || '…'} slides`;
      else meta.textContent = `${item.type === 'song' ? 'SONG' : 'ANNOUNCEMENT'} · ${slides(item).length} slides`;
      element.append(title, meta);
      element.onclick = () => { selected = item.id; slideIndex = 0; render(); };
      library.append(element);
    });
  if (!library.children.length && tab === 'presentations') {
    const empty = document.createElement('p'); empty.className = 'empty-library';
    empty.textContent = 'No PowerPoint or PDF presentations imported yet. Use Import PowerPoint to add a deck.';
    library.append(empty);
  }
}

function renderOnlineResults() {
  const library = $('#libraryList'); library.innerHTML = '';
  if (!onlineResults.length) {
    const hint = document.createElement('p'); hint.className = 'empty-library';
    hint.textContent = 'Search the selected lyrics provider. Your saved local songs remain available offline.';
    library.append(hint); return;
  }
  onlineResults.forEach((result) => {
    const element = document.createElement('button'); element.type = 'button'; element.className = 'library-item online-result';
    const title = document.createElement('div'); title.className = 'item-title'; title.textContent = result.title;
    const meta = document.createElement('div'); meta.className = 'item-sub';
    meta.textContent = result.provider === 'musixmatch' ? `${result.artist || 'Artist unavailable'} · MUSIXMATCH` : `HYMN ${result.number} · ${result.category}`;
    element.append(title, meta); element.onclick = () => openOnlineHymn(result); library.append(element);
  });
}

function renderService() {
  const box = $('#serviceList'); box.innerHTML = '';
  data.service.forEach((id, index) => {
    const item = data.items.find((entry) => entry.id === id); if (!item) return;
    const element = document.createElement('div'); element.className = `service-item${id === selected ? ' selected' : ''}`;
    const drag = document.createElement('span'); drag.className = 'drag'; drag.textContent = '⠿';
    const content = document.createElement('div');
    const type = document.createElement('div'); type.className = 'service-type'; type.textContent = item.type === 'presentation' ? 'POWERPOINT' : item.type.toUpperCase();
    const name = document.createElement('div'); name.className = 'service-name'; name.textContent = item.title;
    content.append(type, name);
    const remove = document.createElement('button'); remove.className = 'icon-btn remove'; remove.type = 'button'; remove.title = 'Remove from service'; remove.textContent = '×';
    remove.onclick = (event) => { event.stopPropagation(); data.service.splice(index, 1); save(); renderService(); };
    element.append(drag, content, remove);
    element.onclick = () => { selected = id; slideIndex = 0; render(); };
    box.append(element);
  });
}

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = window.churchflowDesktop.getPdfJsPaths().then(async (paths) => {
      const pdfjs = await import(paths.moduleUrl);
      pdfjs.GlobalWorkerOptions.workerSrc = paths.workerUrl;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function getPresentationDoc(item) {
  if (presentationDocs.has(item.presentationId)) return presentationDocs.get(item.presentationId);
  if (!window.churchflowDesktop?.getPresentationPdf) throw new Error('PowerPoint preview is available in the ChurchFlow desktop app.');
  const [pdfjs, payload] = await Promise.all([getPdfJs(), window.churchflowDesktop.getPresentationPdf(item.presentationId)]);
  const binary = atob(payload.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const documentTask = pdfjs.getDocument({ data: bytes });
  const pdf = await documentTask.promise;
  presentationDocs.set(item.presentationId, pdf);
  if (item.slideCount !== pdf.numPages) {
    item.slideCount = pdf.numPages;
    save();
    if (selected === item.id) $('#slideCounter').textContent = `Slide ${slideIndex + 1} of ${pdf.numPages}`;
    if (tab === 'presentations') renderLibrary();
  }
  return pdf;
}

async function renderPdfPageToCanvas(item, index, canvas, targetWidth, targetHeight) {
  const pdf = await getPresentationDoc(item);
  const safeIndex = Math.min(Math.max(0, index), pdf.numPages - 1);
  const page = await pdf.getPage(safeIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const width = Math.max(1, targetWidth || canvas.clientWidth || 800);
  const height = Math.max(1, targetHeight || canvas.clientHeight || 450);
  const scale = Math.min(width / base.width, height / base.height);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#050914'; context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

function paint(element, item, index, blank = false) {
  element.innerHTML = '';
  if (blank) return;
  if (item?.type === 'presentation') {
    const canvas = document.createElement('canvas'); canvas.className = 'pdf-slide-canvas';
    element.append(canvas);
    renderPdfPageToCanvas(item, index, canvas, element.clientWidth - 24, element.clientHeight - 24)
      .catch((error) => { element.textContent = `Could not render this slide: ${error.message}`; });
    return;
  }
  const parts = slides(item); const content = parts[index] || 'Select an item';
  const wrap = document.createElement('div'); wrap.className = 'preview-content';
  const tag = document.createElement('span'); tag.className = 'eyebrow'; tag.textContent = 'CHURCHFLOW';
  const heading = document.createElement(element.id === 'livePreview' ? 'h2' : 'h1'); heading.textContent = item?.title || 'ChurchFlow';
  const paragraph = document.createElement('p'); paragraph.textContent = content;
  wrap.append(tag, heading, paragraph); element.append(wrap);
}

function render() {
  renderLibrary(); renderService();
  const item = current(); const count = item ? slides(item).length : 0;
  $('#slideCounter').textContent = `Slide ${item ? slideIndex + 1 : 0} of ${count}`;
  $('#presenterViewButton').hidden = item?.type !== 'presentation';
  paint($('#preview'), item, slideIndex);
  paint($('#livePreview'), liveItem, liveIndex, liveBlank);
  if ($('#presenterDialog').open) updatePresenterView().catch(console.error);
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  String(text || '').split('\n').forEach((paragraph) => {
    if (!paragraph) { lines.push(''); return; }
    const words = paragraph.split(/\s+/); let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
  });
  return lines;
}

async function createOutputCanvas(item, index, blank = false) {
  const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#050914'; ctx.fillRect(0, 0, 1920, 1080);
  if (blank) return canvas;
  if (item?.type === 'presentation') {
    const pdf = await getPresentationDoc(item);
    const page = await pdf.getPage(Math.min(Math.max(0, index), pdf.numPages - 1) + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1920 / base.width, 1080 / base.height);
    const viewport = page.getViewport({ scale });
    const left = (1920 - viewport.width) / 2; const top = (1080 - viewport.height) / 2;
    await page.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, left, top] }).promise;
    return canvas;
  }
  const gradient = ctx.createRadialGradient(1320, 250, 30, 1000, 540, 1250);
  gradient.addColorStop(0, '#263a65'); gradient.addColorStop(1, '#050914');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1920, 1080);
  ctx.textAlign = 'center'; ctx.fillStyle = '#9fb2ff'; ctx.font = '600 24px Arial';
  ctx.fillText('CHURCHFLOW', 960, 170);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 56px Arial';
  const titleLines = wrapCanvasText(ctx, item?.title || 'ChurchFlow', 1550);
  let y = 310; titleLines.slice(0, 2).forEach((line) => { ctx.fillText(line, 960, y); y += 70; });
  ctx.fillStyle = '#e3eaf8'; ctx.font = '400 62px Arial';
  const body = slides(item)[index] || '';
  const lines = wrapCanvasText(ctx, body, 1560);
  const lineHeight = Math.min(88, 700 / Math.max(1, lines.length));
  y = Math.max(560, (1080 - lines.length * lineHeight) / 2 + 100);
  lines.slice(0, 8).forEach((line) => { ctx.fillText(line, 960, y); y += lineHeight; });
  return canvas;
}

async function renderDisplayPayload() {
  if (liveBlank) return { type: 'renderImage', blank: true };
  const canvas = await createOutputCanvas(liveItem, liveIndex, false);
  return { type: 'renderImage', dataUrl: canvas.toDataURL('image/png'), blank: false };
}

async function publishNdiFrame(canvas) {
  if (!ndiActive || !window.churchflowDesktop?.ndiSendFrame) return;
  try {
    const outputWidth = data.ndi?.profile?.includes('720p') ? 1280 : 1920;
    const outputHeight = data.ndi?.profile?.includes('720p') ? 720 : 1080;
    let frameCanvas = canvas;
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
      frameCanvas = document.createElement('canvas'); frameCanvas.width = outputWidth; frameCanvas.height = outputHeight;
      frameCanvas.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, outputWidth, outputHeight);
    }
    const image = frameCanvas.getContext('2d').getImageData(0, 0, frameCanvas.width, frameCanvas.height);
    await window.churchflowDesktop.ndiSendFrame(new Uint8Array(image.data.buffer), frameCanvas.width, frameCanvas.height);
  } catch (error) {
    $('#ndiStatus').textContent = `NDI frame error: ${error.message}`;
  }
}

async function syncDisplayWindow(display) {
  if (!display || display.closed) return;
  const payload = await renderDisplayPayload();
  try { display.postMessage(payload, '*'); } catch (error) { console.warn('Display update failed:', error); }
  if (ndiActive) {
    const canvas = await createOutputCanvas(liveItem, liveIndex, liveBlank);
    await publishNdiFrame(canvas);
  }
}

function openDisplay() {
  const display = window.open('display.html', `churchflow-display-${Date.now()}`, 'popup,width=1280,height=720');
  if (!display) { alert('ChurchFlow could not open the display window. Check whether Windows security settings are blocking it.'); return; }
  displayWindows.push(display);
  setTimeout(() => syncDisplayWindow(display).catch((error) => console.error(error)), 400);
}

async function sendDisplays() {
  displayWindows = displayWindows.filter((display) => !display.closed);
  if (!displayWindows.length && !ndiActive) return;
  const payload = await renderDisplayPayload();
  displayWindows.forEach((display) => { try { display.postMessage(payload, '*'); } catch (error) { /* display may be closing */ } });
  if (ndiActive) {
    const canvas = await createOutputCanvas(liveItem, liveIndex, liveBlank);
    await publishNdiFrame(canvas);
  }
}

function addItem(type) {
  editingId = null;
  $('#editorTitle').textContent = type === 'song' ? 'Add song' : 'Add announcement slide';
  $('#itemTitle').value = ''; $('#itemBody').value = '';
  $('#editor').dataset.type = type; $('#editor').showModal();
}

async function openOnlineHymn(summary) {
  loadedOnlineHymn = null;
  $('#onlineHymnTitle').textContent = summary.title;
  $('#onlineHymnMeta').textContent = summary.provider === 'musixmatch'
    ? `${summary.artist || 'Unknown artist'} · Musixmatch`
    : `Hymn ${summary.number} · ${summary.category} · Gospel Hymns & Songs`;
  $('#onlineHymnLyrics').textContent = 'Loading lyrics…';
  $('#importOnlineHymn').disabled = true;
  $('#onlineRightsNote').textContent = summary.provider === 'musixmatch'
    ? 'Musixmatch lyric availability and reuse rights depend on your API plan and licence. Confirm that your account permits church projection and local storage before importing.'
    : 'Before adding lyrics to your local library, confirm that your church has permission to use them or that they are in the public domain.';
  $('#onlineHymnDialog').showModal();
  try {
    const hymn = summary.provider === 'musixmatch'
      ? await window.churchflowDesktop.getMusixmatchLyrics(summary.id)
      : await window.churchflowDesktop.getGospelHymn(summary.number);
    loadedOnlineHymn = { ...summary, ...hymn, title: summary.title || hymn.title, artist: summary.artist || '', sourceUrl: summary.sourceUrl || hymn.sourceUrl };
    $('#onlineHymnTitle').textContent = loadedOnlineHymn.title;
    $('#onlineHymnMeta').textContent = summary.provider === 'musixmatch'
      ? `${summary.artist || 'Unknown artist'} · Musixmatch${hymn.copyright ? ` · ${hymn.copyright}` : ''}`
      : `Hymn ${hymn.number} · ${hymn.category} · Gospel Hymns & Songs`;
    $('#onlineHymnLyrics').textContent = hymn.body || 'No lyric text was returned for this song.';
    $('#importOnlineHymn').disabled = !hymn.body;
  } catch (error) {
    $('#onlineHymnLyrics').textContent = error.message || 'Could not load these lyrics.';
  }
}

async function searchOnline() {
  const query = $('#search').value.trim();
  if (query.length < 2) { $('#onlineStatus').textContent = 'Enter at least two characters to search.'; return; }
  const provider = $('#lyricsProvider').value;
  $('#onlineSearchButton').disabled = true;
  $('#onlineStatus').textContent = provider === 'musixmatch' ? 'Searching Musixmatch…' : 'Searching Gospel Hymns & Songs…';
  try {
    onlineResults = provider === 'musixmatch'
      ? await window.churchflowDesktop.searchMusixmatch(query)
      : await window.churchflowDesktop.searchGospelHymns(query);
    $('#onlineStatus').textContent = onlineResults.length
      ? `${onlineResults.length} results · ${provider === 'musixmatch' ? 'Musixmatch account and plan apply.' : 'Gospel Hymns & Songs catalogue; provider rate limits apply.'}`
      : 'No matching songs found. Try fewer words or another spelling.';
    renderOnlineResults();
  } catch (error) {
    onlineResults = [];
    $('#onlineStatus').textContent = error.message || 'The online lyrics service could not be reached.';
    renderOnlineResults();
  } finally { $('#onlineSearchButton').disabled = false; }
}

async function importPowerPoint() {
  if (!window.churchflowDesktop?.importPresentation) { alert('PowerPoint import requires the ChurchFlow desktop application.'); return; }
  $('#saveStatus').textContent = 'Importing presentation…';
  try {
    const result = await window.churchflowDesktop.importPresentation();
    if (!result) { $('#saveStatus').textContent = 'Saved locally'; return; }
    const id = result.id;
    const item = {
      id: `pptx-${id}`, type: 'presentation', title: result.title, body: '',
      presentationId: id, originalName: result.originalName, notes: result.notes || {}, slideCount: 0
    };
    data.items.push(item); data.service.push(item.id); selected = item.id; slideIndex = 0; tab = 'presentations';
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    save(); render();
    getPresentationDoc(item).then(() => render()).catch((error) => { $('#saveStatus').textContent = error.message; });
  } catch (error) {
    $('#saveStatus').textContent = 'Import failed';
    alert(error.message || 'ChurchFlow could not import this presentation.');
  }
}

async function updatePresenterView() {
  const selectedItem = current();
  if (selectedItem?.type !== 'presentation') return;
  // When the selected presentation is already live, Presenter View follows the
  // exact live snapshot and index instead of the operator's unsent preview.
  const isLivePresentation = liveItem?.type === 'presentation' && liveItem.id === selectedItem.id;
  const item = isLivePresentation ? liveItem : selectedItem;
  const pdf = await getPresentationDoc(item);
  const count = pdf.numPages;
  const activeIndex = isLivePresentation ? liveIndex : slideIndex;
  slideIndex = Math.max(0, Math.min(activeIndex, count - 1));
  if (isLivePresentation) liveIndex = slideIndex;
  const currentCanvas = $('#presenterCurrent'); const nextCanvas = $('#presenterNextCanvas');
  await renderPdfPageToCanvas(item, slideIndex, currentCanvas, currentCanvas.clientWidth || 760, 480);
  const nextIndex = slideIndex + 1;
  if (nextIndex < count) await renderPdfPageToCanvas(item, nextIndex, nextCanvas, nextCanvas.clientWidth || 380, 240);
  else { const ctx = nextCanvas.getContext('2d'); nextCanvas.width = 760; nextCanvas.height = 428; ctx.fillStyle = '#050914'; ctx.fillRect(0, 0, 760, 428); ctx.fillStyle = '#aab5c8'; ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.fillText('End of presentation', 380, 218); }
  const liveLabel = isLivePresentation ? ' · LIVE OUTPUT' : ' · PREVIEW — NOT LIVE';
  $('#presenterStatus').textContent = `Slide ${slideIndex + 1} of ${count} · ${item.originalName || item.title}${liveLabel}`;
  $('#presenterNotes').textContent = item.notes?.[String(slideIndex)] || 'No speaker notes were found for this slide.';
}

async function startNdi() {
  data.ndi = { name: $('#ndiName').value.trim() || 'ChurchFlow - Main Output', profile: $('#ndiProfile').value };
  save();
  try {
    const result = await window.churchflowDesktop.ndiStart(data.ndi);
    ndiActive = true;
    $('#ndiStatus').textContent = `NDI sending as “${result.sourceName}” at ${result.fps} fps.`;
    $('#ndiState').textContent = 'Active'; $('#ndiState').className = 'state-pill ready';
    $('#startNdi').disabled = true; $('#stopNdi').disabled = false;
    // Publish an initial slate immediately so NDI receivers can discover the source.
    await sendDisplays();
  } catch (error) {
    ndiActive = false;
    $('#ndiState').textContent = 'SDK required'; $('#ndiState').className = 'state-pill pending';
    $('#ndiStatus').textContent = error.message || 'Could not start NDI output.';
  }
}

async function stopNdi() {
  try { await window.churchflowDesktop.ndiStop(); } catch (error) { console.error(error); }
  ndiActive = false; $('#startNdi').disabled = false; $('#stopNdi').disabled = true;
  $('#ndiState').textContent = 'Stopped'; $('#ndiState').className = 'state-pill pending';
  $('#ndiStatus').textContent = 'NDI output stopped. Clean capture window remains available.';
}

$('#search').addEventListener('input', () => { if (tab !== 'online') renderLibrary(); });
$('#search').addEventListener('keydown', (event) => { if (event.key === 'Enter' && tab === 'online') searchOnline(); });
$('#onlineSearchButton').onclick = searchOnline;
$('#lyricsProvider').onchange = () => {
  onlineResults = []; renderOnlineResults();
  $('#onlineStatus').textContent = $('#lyricsProvider').value === 'musixmatch'
    ? 'Musixmatch requires an API key and an account with suitable lyric access.'
    : 'Search the Gospel Hymns & Songs catalogue.';
};
$('#configureLyricsKey').onclick = async () => {
  $('#musixmatchApiKey').value = '';
  try {
    const hasKey = await window.churchflowDesktop.hasMusixmatchKey();
    $('#musixmatchApiKey').placeholder = hasKey ? 'A key is already saved; enter a replacement' : 'Paste your provider API key';
  } catch { /* the desktop key store may not be available in preview mode */ }
  $('#lyricsKeyDialog').showModal();
};
$('#saveLyricsKey').onclick = async (event) => {
  event.preventDefault();
  const key = $('#musixmatchApiKey').value.trim();
  if (!key) { alert('Paste your Musixmatch API key first.'); return; }
  try {
    await window.churchflowDesktop.setMusixmatchKey(key);
    $('#lyricsKeyDialog').close(); $('#onlineStatus').textContent = 'Musixmatch API key saved securely on this Windows device.';
    $('#musixmatchApiKey').value = '';
  } catch (error) { alert(error.message || 'The API key could not be saved.'); }
};

document.querySelectorAll('.tab').forEach((button) => {
  button.onclick = () => {
    tab = button.dataset.tab;
    document.querySelectorAll('.tab').forEach((other) => other.classList.toggle('active', other === button));
    renderLibrary();
  };
});

$('#addSong').onclick = () => addItem('song');
$('#addSlide').onclick = () => addItem('slide');
$('#importPowerPoint').onclick = importPowerPoint;
$('#importPowerPointLibrary').onclick = importPowerPoint;
$('#saveItem').onclick = (event) => {
  event.preventDefault(); const title = $('#itemTitle').value.trim(); if (!title) return;
  if (editingId) {
    const item = data.items.find((entry) => entry.id === editingId);
    if (item) { item.title = title; item.body = $('#itemBody').value; }
  } else {
    const id = `item-${Date.now()}`;
    data.items.push({ id, type: $('#editor').dataset.type, title, body: $('#itemBody').value });
    selected = id; data.service.push(id);
  }
  save(); $('#editor').close();
  tab = $('#editor').dataset.type === 'song' ? 'songs' : 'slides';
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  render();
};

$('#prevSlide').onclick = () => { slideIndex = Math.max(0, slideIndex - 1); render(); };
$('#nextSlide').onclick = () => { slideIndex = Math.min(slides(current()).length - 1, slideIndex + 1); render(); };
$('#goLive').onclick = async () => {
  liveItem = current() ? JSON.parse(JSON.stringify(current())) : null;
  liveIndex = slideIndex; liveBlank = false; render(); await sendDisplays();
};
$('#blackout').onclick = async () => { liveBlank = true; render(); await sendDisplays(); };
$('#livePrev').onclick = async () => { liveIndex = Math.max(0, liveIndex - 1); liveBlank = false; render(); await sendDisplays(); };
$('#liveNext').onclick = async () => { liveIndex = Math.min(slides(liveItem).length - 1, liveIndex + 1); liveBlank = false; render(); await sendDisplays(); };
$('#clearLive').onclick = async () => { liveBlank = true; render(); await sendDisplays(); };
$('#restoreLive').onclick = async () => { liveBlank = false; render(); await sendDisplays(); };
$('#openDisplay').onclick = openDisplay;
$('#openAnother').onclick = openDisplay;
$('#openCapture').onclick = openDisplay;

$('#ndiName').value = data.ndi?.name || 'ChurchFlow - Main Output';
$('#ndiProfile').value = data.ndi?.profile || '1080p · 30 fps';
$('#saveNdi').onclick = () => { data.ndi = { name: $('#ndiName').value.trim() || 'ChurchFlow - Main Output', profile: $('#ndiProfile').value }; save(); $('#ndiStatus').textContent = 'NDI source settings saved.'; };
$('#startNdi').onclick = startNdi;
$('#stopNdi').onclick = stopNdi;
$('#runDiagnostics').onclick = async () => {
  const output = $('#diagnosticsOutput');
  output.textContent = 'Running checks…';
  try {
    const report = await window.churchflowDesktop.runDiagnostics();
    const rows = [
      ['ChurchFlow', `v${report.appVersion} · ${report.packaged ? 'installed application' : 'development mode'}`],
      ['Runtime', `Electron ${report.electronVersion} · Node ${report.nodeVersion} · ${report.platform}/${report.architecture}`],
      ['PDF rendering', report.pdfjsAvailable ? 'Available' : 'Missing PDF.js dependency'],
      ['PowerPoint converter', report.powerpointExecutableFound ? 'Microsoft PowerPoint detected' : report.libreOfficeAvailable ? 'PowerPoint not found; LibreOffice can convert PPTX' : 'No converter detected; install PowerPoint or LibreOffice'],
      ['LibreOffice', report.libreOfficeAvailable ? 'Detected' : 'Not detected'],
      ['NDI module file', report.ndiModuleFileFound ? 'Found' : 'Not built'],
      ['NDI module loading', report.ndiModuleLoads ? 'Loaded' : 'Unavailable'],
      ['NDI runtime', report.ndiRuntimeDllFound ? 'DLL found' : 'Not detected beside module / SDK path'],
      ['Open ChurchFlow windows', String(report.openWindows)]
    ];
    output.textContent = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  } catch (error) {
    output.textContent = `System check failed: ${error.message || error}`;
  }
};

async function sendSelectedPresentationLive() {
  const item = current();
  if (item?.type !== 'presentation') return;
  liveItem = JSON.parse(JSON.stringify(item));
  liveIndex = slideIndex;
  liveBlank = false;
  render();
  await sendDisplays();
}

$('#presenterViewButton').onclick = async () => {
  const item = current();
  if (item?.type !== 'presentation') return;
  if (liveItem?.type === 'presentation' && liveItem.id === item.id) slideIndex = liveIndex;
  $('#presenterDialog').showModal();
  try {
    // Opening Presenter View is read-only: it must never change audience output.
    await updatePresenterView();
  } catch (error) { $('#presenterStatus').textContent = error.message; }
};
$('#closePresenter').onclick = () => $('#presenterDialog').close();
async function movePresenterSlide(direction) {
  const item = current();
  if (item?.type !== 'presentation') return;
  const isLivePresentation = liveItem?.type === 'presentation' && liveItem.id === item.id;
  if (isLivePresentation) {
    liveIndex = Math.max(0, Math.min(slides(liveItem).length - 1, liveIndex + direction));
    slideIndex = liveIndex;
  } else {
    slideIndex = Math.max(0, Math.min(slides(item).length - 1, slideIndex + direction));
  }
  render();
  if (isLivePresentation) await sendDisplays();
}
$('#presenterPrev').onclick = () => movePresenterSlide(-1);
$('#presenterNext').onclick = () => movePresenterSlide(1);
$('#presenterGoLive').onclick = sendSelectedPresentationLive;


// GitHub Releases updater UI. Updates are offered to the operator; they are never
// installed without an explicit click.
const updateDialog = $('#updateDialog');
let updateReadyToInstall = false;
function showUpdateState(state) {
  if (!state) return;
  const title = $('#updateTitle'); const message = $('#updateMessage'); const progress = $('#updateProgress'); const install = $('#installUpdate');
  if (state.status === 'available') {
    title.textContent = `ChurchFlow ${state.version} is available`;
    message.textContent = 'A new version is ready to download. Your current installation will remain available until you choose to update.';
    install.hidden = false; install.textContent = 'Download update'; updateReadyToInstall = false;
    if (!updateDialog.open) updateDialog.showModal();
  } else if (state.status === 'current') {
    title.textContent = 'ChurchFlow is up to date'; message.textContent = `You are using the latest available version (v${state.version}).`; progress.textContent = ''; install.hidden = true;
  } else if (state.status === 'checking') {
    title.textContent = 'Checking for updates'; message.textContent = 'Connecting to ChurchFlow Releases on GitHub…'; install.hidden = true;
  } else if (state.status === 'downloading') {
    title.textContent = 'Downloading ChurchFlow update'; message.textContent = 'Please keep ChurchFlow open while the update downloads.'; progress.textContent = `${state.percent || 0}%`; install.hidden = true;
  } else if (state.status === 'downloaded') {
    title.textContent = 'Update ready to install'; message.textContent = `ChurchFlow ${state.version} has downloaded successfully.`; progress.textContent = 'ChurchFlow will restart to finish updating.'; install.hidden = false; install.textContent = 'Restart and install'; updateReadyToInstall = true;
    if (!updateDialog.open) updateDialog.showModal();
  } else if (state.status === 'error') {
    title.textContent = 'Update check unavailable'; message.textContent = state.message || 'Could not check for updates. You can try again later.'; progress.textContent = ''; install.hidden = true;
  } else if (state.status === 'development') {
    title.textContent = 'Updates require the installed app'; message.textContent = 'Build and install ChurchFlow to use automatic updates.'; install.hidden = true;
  }
}
$('#checkUpdates').onclick = async () => {
  updateDialog.showModal(); showUpdateState({ status: 'checking' });
  try { showUpdateState(await window.churchflowDesktop.checkForUpdates()); }
  catch (error) { showUpdateState({ status: 'error', message: error.message }); }
};
$('#closeUpdate').onclick = () => updateDialog.close();
$('#laterUpdate').onclick = () => updateDialog.close();
$('#installUpdate').onclick = async () => {
  const button = $('#installUpdate'); button.disabled = true;
  try {
    if (updateReadyToInstall) await window.churchflowDesktop.installUpdate();
    else { await window.churchflowDesktop.downloadUpdate(); button.hidden = true; $('#updateMessage').textContent = 'Downloading update…'; }
  } catch (error) { showUpdateState({ status: 'error', message: error.message }); }
  finally { button.disabled = false; }
};
window.churchflowDesktop?.onUpdateStatus?.(showUpdateState);
window.churchflowDesktop?.getUpdateState?.().then((state) => { if (state?.status && state.status !== 'idle') showUpdateState(state); }).catch(() => {});

$('#newService').onclick = () => {
  if (confirm('Start a new service order? Your library will remain unchanged.')) { data.service = []; save(); renderService(); }
};

$('#closeOnlineHymn').onclick = () => $('#onlineHymnDialog').close();
$('#cancelOnlineHymn').onclick = () => $('#onlineHymnDialog').close();
$('#importOnlineHymn').onclick = () => {
  if (!loadedOnlineHymn?.body) return;
  const providerName = loadedOnlineHymn.provider === 'musixmatch' ? 'Musixmatch' : 'Gospel Hymns & Songs';
  const accepted = confirm(`Only import and project these lyrics if your church's licence or public-domain status permits it. ${providerName} access alone does not necessarily grant offline storage or projection rights. Continue?`);
  if (!accepted) return;
  const id = `online-${Date.now()}`;
  data.items.push({ id, type: 'song', title: loadedOnlineHymn.title, body: loadedOnlineHymn.body, source: loadedOnlineHymn.source, sourceUrl: loadedOnlineHymn.sourceUrl, lyricRightsConfirmed: true });
  data.service.push(id); selected = id; slideIndex = 0; tab = 'songs';
  $('#onlineHymnDialog').close();
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  save(); render();
};

window.addEventListener('storage', (event) => { if (event.key === 'churchflow-data') { data = load(); render(); } });
window.addEventListener('beforeunload', () => { if (ndiActive) window.churchflowDesktop?.ndiStop(); });

// Presentation shortcuts; typing in an input does not send slides live.
window.addEventListener('keydown', async (event) => {
  const target = event.target;
  const isTyping = target && (target.matches('input, textarea, select') || target.isContentEditable);
  if (isTyping || $('#editor').open || $('#onlineHymnDialog').open || $('#lyricsKeyDialog').open) return;
  const count = slides(liveItem).length;
  if (event.key === 'ArrowRight' || event.code === 'Space') {
    event.preventDefault(); liveIndex = Math.min(Math.max(0, count - 1), liveIndex + 1); liveBlank = false; render(); await sendDisplays();
  } else if (event.key === 'ArrowLeft') {
    liveIndex = Math.max(0, liveIndex - 1); liveBlank = false; render(); await sendDisplays();
  } else if (event.key.toLowerCase() === 'b') {
    liveBlank = true; render(); await sendDisplays();
  } else if (event.key === 'Home') {
    liveIndex = 0; liveBlank = false; render(); await sendDisplays();
  } else if (event.key === 'End') {
    liveIndex = Math.max(0, count - 1); liveBlank = false; render(); await sendDisplays();
  } else if (event.ctrlKey && event.key.toLowerCase() === 's') {
    event.preventDefault(); save();
  } else if (event.key === 'F5') {
    event.preventDefault(); if (current()) { liveItem = JSON.parse(JSON.stringify(current())); liveIndex = slideIndex; liveBlank = false; render(); await sendDisplays(); }
  }
});

render();
