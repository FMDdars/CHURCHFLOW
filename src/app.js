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
let onlineSearchTimer = null;
let onlineSearchRequest = 0;
let loadedOnlineHymn = null;
let pdfjsPromise = null;
const presentationDocs = new Map();
let ndiActive = false;
let backgroundImageCache = null;
let backgroundVideoReadyUrl = null;
let backgroundRefreshTimer = null;

function defaultData() {
  return { items: starter, service: ['s1', 'p1'], outputMode: 'full', lyricsLinesPerSlide: 4, background: null, ndi: { name: 'ChurchFlow - Main Output', profile: '1080p · 30 fps' } };
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
  if (item?.type === 'song') {
    const lowerThird = data.outputMode === 'lower-third';
    const maxLines = Math.max(1, Math.min(8, Number(data.lyricsLinesPerSlide) || 4));
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = lowerThird ? '600 54px Arial' : '400 62px Arial';
    const maxWidth = lowerThird ? 1720 : 1560;
    const lyricLines = (item.body || '').split(/\n---\n/g)
      .flatMap((stanza) => stanza.split(/\r?\n/))
      .flatMap((line) => wrapCanvasText(measure, line.trim(), maxWidth))
      .filter((line) => line.trim());
    const pages = [];
    for (let index = 0; index < lyricLines.length; index += maxLines) {
      pages.push(lyricLines.slice(index, index + maxLines).join('\n'));
    }
    return pages.length ? pages : [''];
  }
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
  $('#onlineSearchButton').hidden = true;
  $('#editSelectedSong').hidden = current()?.type !== 'song';
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
  } else if (!library.children.length && tab === 'songs' && query.trim()) {
    const empty = document.createElement('p'); empty.className = 'empty-library';
    empty.textContent = 'No saved song found. Searching online lyrics catalogues automatically…';
    library.append(empty);
  } else if (!library.children.length && tab === 'slides' && query.trim()) {
    const empty = document.createElement('p'); empty.className = 'empty-library';
    empty.textContent = 'No announcement slides match that search.';
    library.append(empty);
  }
}

function renderOnlineResults() {
  const library = $('#libraryList'); library.innerHTML = '';
  if (!onlineResults.length) {
    const hint = document.createElement('p'); hint.className = 'empty-library';
    hint.textContent = 'Search all online lyrics sources at once. Your saved songs and imported OpenLyrics collection remain available offline.';
    library.append(hint); return;
  }
  onlineResults.forEach((result) => {
    const element = document.createElement('button'); element.type = 'button'; element.className = 'library-item online-result';
    const title = document.createElement('div'); title.className = 'item-title'; title.textContent = result.title;
    const meta = document.createElement('div'); meta.className = 'item-sub';
    meta.textContent = result.provider === 'gospel-hymns' ? `HYMN ${result.number} · ${result.category} · Gospel Hymns & Songs` : `${result.artist || 'Unknown artist'} · ${result.source || result.provider}`;
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
  const heading = document.createElement(element.id === 'livePreview' ? 'h2' : 'h1'); heading.textContent = item?.title || 'ChurchFlow';
  const paragraph = document.createElement('p'); paragraph.textContent = content;
  wrap.append(heading, paragraph); element.append(wrap);
}

function render() {
  renderLibrary(); renderService();
  const item = current(); const count = item ? slides(item).length : 0;
  $('#slideCounter').textContent = `Slide ${item ? slideIndex + 1 : 0} of ${count}`;
  $('#presenterViewButton').hidden = item?.type !== 'presentation' && liveItem?.type !== 'presentation';
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
  // Keep alpha enabled so the lower-third overlay can be composited by vMix / NDI.
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.clearRect(0, 0, 1920, 1080);
  if (blank) return canvas;
  if (item?.type === 'presentation') {
    // Imported PowerPoint/PDF slides remain full-frame even when lower-thirds mode is selected.
    ctx.fillStyle = '#050914'; ctx.fillRect(0, 0, 1920, 1080);
    const pdf = await getPresentationDoc(item);
    const page = await pdf.getPage(Math.min(Math.max(0, index), pdf.numPages - 1) + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1920 / base.width, 1080 / base.height);
    const viewport = page.getViewport({ scale });
    const left = (1920 - viewport.width) / 2; const top = (1080 - viewport.height) / 2;
    await page.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, left, top] }).promise;
    return canvas;
  }

  const body = slides(item)[index] || '';
  if (item?.type !== 'presentation' && data.outputMode !== 'lower-third' && data.background?.url) {
    try {
      if (data.background.type === 'video') {
        const video = $('#backgroundVideo');
        if (video && video.src !== data.background.url) {
          video.src = data.background.url; video.loop = true; video.muted = true; video.playsInline = true;
          backgroundVideoReadyUrl = data.background.url;
          await video.play().catch(() => {});
        }
        if (video?.readyState >= 2) ctx.drawImage(video, 0, 0, 1920, 1080);
      } else {
        if (!backgroundImageCache || backgroundImageCache.src !== data.background.url) {
          const image = new Image(); image.src = data.background.url;
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
          backgroundImageCache = image;
        }
        ctx.drawImage(backgroundImageCache, 0, 0, 1920, 1080);
      }
    } catch (error) { console.warn('Custom background could not be rendered:', error); }
  }
  if (data.outputMode === 'lower-third' && item?.type === 'song') {
    // Lyrics-only lower third: the PNG canvas stays fully transparent everywhere
    // except the centered white lyric text. No title, panel, stripe or decoration.
    const lines = wrapCanvasText(ctx, body, 1720).filter((line) => line.trim()).slice(0, Number(data.lyricsLinesPerSlide) || 4);
    const fontSize = Math.max(28, Math.min(62, Math.floor(300 / Math.max(1, lines.length) / 1.28)));
    const lineHeight = fontSize * 1.28;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${fontSize}px Arial`;
    const blockHeight = lines.length * lineHeight;
    let y = 900 - blockHeight / 2 + lineHeight / 2;
    lines.forEach((line) => { ctx.fillText(line, 960, y); y += lineHeight; });
    return canvas;
  }

  // Full-screen output: lyrics only for songs; announcement slides retain their text.
  const isSong = item?.type === 'song';
  if (!isSong) {
    const gradient = ctx.createRadialGradient(1320, 250, 30, 1000, 540, 1250);
    gradient.addColorStop(0, '#263a65'); gradient.addColorStop(1, '#050914');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1920, 1080);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '400 62px Arial';
  const lines = wrapCanvasText(ctx, body, 1560).filter((line) => line.trim()).slice(0, Number(data.lyricsLinesPerSlide) || 4);
  const lineHeight = Math.min(88, 760 / Math.max(1, lines.length));
  let y = 540 - (lines.length * lineHeight) / 2 + lineHeight / 2;
  lines.forEach((line) => { ctx.fillText(line, 960, y); y += lineHeight; });
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
      const resizeContext = frameCanvas.getContext('2d', { alpha: true });
      resizeContext.clearRect(0, 0, outputWidth, outputHeight);
      resizeContext.drawImage(canvas, 0, 0, outputWidth, outputHeight);
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

function lyricsProviderInfo(summary) {
  const providers = {
    local: { label: summary.source || 'OpenLyrics / Local library', url: 'https://docs.openlyrics.org/' },
    lrclib: { label: 'LRCLIB', url: 'https://lrclib.net/' },
    'lrc-red': { label: 'lrc.red', url: 'https://lrc.red/' },
    'lyrics-ovh': { label: 'Lyrics.ovh', url: 'https://lyrics.ovh/' },
    'better-lyrics': { label: 'Better Lyrics', url: 'https://betterlyrics.org/' },
    'gospel-hymns': { label: 'Gospel Hymns & Songs', url: 'https://gospel-hymns.onrender.com/' }
  };
  return providers[summary.provider] || { label: summary.source || summary.provider || 'Lyrics source', url: summary.sourceUrl || 'https://github.com/FMDdars/CHURCHFLOW' };
}

async function fetchOnlineHymnCandidate(candidate) {
  if (candidate.provider === 'local') return { ...candidate, body: candidate.body || '' };
  if (candidate.provider === 'lrclib') return window.churchflowDesktop.getLrclibLyrics(candidate.id);
  if (candidate.provider === 'lrc-red') return window.churchflowDesktop.getLrcRedLyrics(candidate.isrc || candidate.id);
  if (candidate.provider === 'lyrics-ovh') return window.churchflowDesktop.getLyricsOvhLyrics(candidate.artist, candidate.title);
  if (candidate.provider === 'better-lyrics') return window.churchflowDesktop.getBetterLyrics(candidate);
  if (candidate.provider === 'gospel-hymns') return window.churchflowDesktop.getGospelHymn(candidate.number);
  throw new Error('This lyrics provider is not supported.');
}

async function openOnlineHymn(summary) {
  loadedOnlineHymn = null;
  $('#onlineHymnTitle').textContent = summary.title;
  const initialInfo = lyricsProviderInfo(summary);
  $('#onlineHymnMeta').textContent = summary.provider === 'gospel-hymns'
    ? `Hymn ${summary.number} · ${summary.category} · ${initialInfo.label}`
    : `${summary.artist || 'Unknown artist'} · ${initialInfo.label}`;
  const sourceLink = $('#onlineSourceLink');
  sourceLink.href = summary.sourceUrl || initialInfo.url;
  sourceLink.textContent = `Lyrics source: ${initialInfo.label}`;
  $('#onlineHymnLyrics').textContent = 'Loading lyrics…';
  $('#importOnlineHymn').disabled = true;
  $('#onlineRightsNote').textContent = summary.provider === 'local'
    ? 'This song is already saved in your local library.'
    : 'Before adding lyrics to your local library, confirm that your church has permission to project or store them, or that the song is in the public domain. API access does not grant lyric rights.';
  $('#onlineHymnDialog').showModal();

  // A catalogue search hit is only a metadata match; it does not guarantee
  // that the provider actually has plain or synced lyrics for that record.
  // Try the selected record first, then exact-title matches from the other
  // providers that were searched for this query.
  const targetTitle = normalize(summary.title);
  const targetArtist = normalize(summary.artist || '');
  const alternatives = onlineResults
    .filter((candidate) => candidate !== summary && normalize(candidate.title) === targetTitle)
    .sort((a, b) => {
      const aArtist = targetArtist && normalize(a.artist || '') === targetArtist ? 1 : 0;
      const bArtist = targetArtist && normalize(b.artist || '') === targetArtist ? 1 : 0;
      const aDifferentProvider = a.provider !== summary.provider ? 1 : 0;
      const bDifferentProvider = b.provider !== summary.provider ? 1 : 0;
      return (bArtist - aArtist) || (bDifferentProvider - aDifferentProvider);
    });
  const candidates = [summary, ...alternatives];
  const attempted = new Set();
  const errors = [];

  for (const candidate of candidates) {
    const key = `${candidate.provider}:${candidate.id || candidate.number || candidate.title}`;
    if (attempted.has(key)) continue;
    attempted.add(key);
    try {
      const hymn = await fetchOnlineHymnCandidate(candidate);
      if (!hymn || typeof hymn.body !== 'string' || !hymn.body.trim()) {
        errors.push(`${lyricsProviderInfo(candidate).label}: no lyric text`);
        continue;
      }

      const actualInfo = lyricsProviderInfo(candidate);
      loadedOnlineHymn = {
        ...candidate, ...hymn,
        title: candidate.title || hymn.title,
        artist: candidate.artist || hymn.artist || '',
        source: hymn.source || candidate.source || actualInfo.label,
        provider: candidate.provider,
        sourceUrl: candidate.sourceUrl || hymn.sourceUrl || actualInfo.url
      };
      $('#onlineHymnTitle').textContent = loadedOnlineHymn.title;
      $('#onlineHymnMeta').textContent = candidate.provider === 'gospel-hymns'
        ? `Hymn ${hymn.number || candidate.number} · ${hymn.category || candidate.category} · ${actualInfo.label}`
        : `${loadedOnlineHymn.artist || 'Unknown artist'} · ${actualInfo.label}`;
      sourceLink.href = loadedOnlineHymn.sourceUrl;
      sourceLink.textContent = `Lyrics source: ${actualInfo.label}`;
      $('#onlineHymnLyrics').textContent = hymn.body.trim();
      $('#importOnlineHymn').disabled = false;
      if (candidate !== summary) {
        $('#onlineStatus').textContent = `${summary.title}: lyrics were unavailable from ${initialInfo.label}; ChurchFlow found a matching record from ${actualInfo.label} instead.`;
      }
      return;
    } catch (error) {
      errors.push(`${lyricsProviderInfo(candidate).label}: ${error.message || 'lookup failed'}`);
    }
  }

  $('#onlineHymnLyrics').textContent = alternatives.length
    ? 'Lyrics were not available from the matching catalogue records. Try another search term or import the song from an OpenLyrics collection.'
    : 'This search result contains song information, but no lyrics were returned. Try searching by the full song title and artist, or import the song from an OpenLyrics collection.';
  $('#onlineRightsNote').textContent = 'ChurchFlow checked the matching records returned by its available lyrics catalogues. A search result does not guarantee that lyrics are available.';
  $('#onlineStatus').textContent = `No lyrics found for “${summary.title}”. ${errors.slice(0, 4).join(' · ')}`;
}
async function searchOnline() {
  const query = $('#search').value.trim();
  const requestId = ++onlineSearchRequest;
  if (query.length < 2) { $('#onlineStatus').textContent = 'Enter at least two characters to search.'; return; }
  $('#onlineSearchButton').disabled = true;
  $('#onlineStatus').textContent = 'Searching Gospel Hymns & Songs, LRCLIB, lrc.red, Lyrics.ovh and cached Better Lyrics results…';
  try {
    const settled = await Promise.allSettled([
      window.churchflowDesktop.searchGospelHymns(query),
      window.churchflowDesktop.searchLrclib(query),
      window.churchflowDesktop.searchLrcRed(query),
      window.churchflowDesktop.searchLyricsOvh(query)
    ]);
    const names = ['Gospel Hymns & Songs', 'LRCLIB', 'lrc.red', 'Lyrics.ovh'];
    const results = [];
    const sourceStatus = [];
    settled.forEach((entry, index) => {
      if (entry.status === 'fulfilled') {
        results.push(...(Array.isArray(entry.value) ? entry.value : []));
        sourceStatus.push(`${names[index]}: ${entry.value?.length || 0}`);
      } else sourceStatus.push(`${names[index]}: unavailable`);
    });
    const localMatches = data.items.filter((item) => item.type === 'song')
      .map((item) => ({ item, score: searchScore(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, 20)
      .map(({ item }) => ({ id: item.id, title: item.title, artist: 'Saved on this computer', body: item.body, source: item.source || 'Local library', provider: 'local', sourceUrl: 'https://docs.openlyrics.org/' }));
    results.push(...localMatches);
    const betterCandidates = results.filter((item) => item.provider === 'lyrics-ovh' || item.provider === 'lrclib' || item.provider === 'lrc-red')
      .sort((a, b) => (b.provider === 'lyrics-ovh' ? 1 : 0) - (a.provider === 'lyrics-ovh' ? 1 : 0))
      .slice(0, 10).map((item) => ({ title: item.title, artist: item.artist || '', album: item.album || '', duration: Number(item.duration || 0) }));
    if (betterCandidates.length) {
      try {
        const better = await window.churchflowDesktop.searchBetterLyrics(betterCandidates);
        results.push(...better);
        sourceStatus.push(`Better Lyrics cached: ${better.length}`);
      } catch { sourceStatus.push('Better Lyrics: unavailable'); }
    }
    if (requestId !== onlineSearchRequest) return;
    onlineResults = results;
    $('#onlineStatus').textContent = `${results.length} matches across sources · ${sourceStatus.join(' · ')}. Choose a result to preview its lyrics.`;
    renderOnlineResults();
  } catch (error) {
    if (requestId !== onlineSearchRequest) return;
    onlineResults = [];
    $('#onlineStatus').textContent = error.message || 'The online lyrics services could not be reached.';
    renderOnlineResults();
  } finally {
    if (requestId === onlineSearchRequest) $('#onlineSearchButton').disabled = false;
  }
}

async function importOpenLyrics() {
  if (!window.churchflowDesktop?.importOpenLyrics) { alert('OpenLyrics import requires the ChurchFlow desktop application.'); return; }
  $('#onlineStatus').textContent = 'Choose OpenLyrics XML files or a ZIP collection…';
  try {
    const result = await window.churchflowDesktop.importOpenLyrics();
    if (!result?.songs?.length) { $('#onlineStatus').textContent = 'No OpenLyrics songs were imported.'; return; }
    let added = 0;
    for (const song of result.songs) {
      const duplicate = data.items.some((item) => item.type === 'song' && normalize(item.title) === normalize(song.title) && normalize(item.body) === normalize(song.body));
      if (duplicate) continue;
      const id = `openlyrics-${Date.now()}-${added}`;
      data.items.push({ id, type: 'song', title: song.title, body: song.body, source: 'OpenLyrics import', originalName: song.originalName });
      added += 1;
    }
    save();
    $('#onlineStatus').textContent = `Imported ${added} OpenLyrics song${added === 1 ? '' : 's'} into your offline library${result.skipped ? ` · ${result.skipped} unsupported or empty files skipped` : ''}.`;
    renderOnlineResults();
  } catch (error) {
    $('#onlineStatus').textContent = error.message || 'OpenLyrics import failed.';
  }
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
  // Presenter View always follows an active live PowerPoint, even if the
  // operator selects another library item while the audience presentation runs.
  const isLivePresentation = liveItem?.type === 'presentation';
  const item = isLivePresentation ? liveItem : selectedItem;
  if (item?.type !== 'presentation') return;
  const pdf = await getPresentationDoc(item);
  const count = pdf.numPages;
  const activeIndex = isLivePresentation ? liveIndex : slideIndex;
  const boundedIndex = Math.max(0, Math.min(activeIndex, count - 1));
  if (isLivePresentation) liveIndex = boundedIndex;
  else slideIndex = boundedIndex;
  const currentCanvas = $('#presenterCurrent'); const nextCanvas = $('#presenterNextCanvas');
  const presenterIndex = isLivePresentation ? liveIndex : slideIndex;
  await renderPdfPageToCanvas(item, presenterIndex, currentCanvas, currentCanvas.clientWidth || 760, 480);
  const nextIndex = presenterIndex + 1;
  if (nextIndex < count) await renderPdfPageToCanvas(item, nextIndex, nextCanvas, nextCanvas.clientWidth || 380, 240);
  else { const ctx = nextCanvas.getContext('2d'); nextCanvas.width = 760; nextCanvas.height = 428; ctx.fillStyle = '#050914'; ctx.fillRect(0, 0, 760, 428); ctx.fillStyle = '#aab5c8'; ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.fillText('End of presentation', 380, 218); }
  const liveLabel = isLivePresentation ? ' · LIVE OUTPUT' : ' · PREVIEW — NOT LIVE';
  $('#presenterStatus').textContent = `Slide ${presenterIndex + 1} of ${count} · ${item.originalName || item.title}${liveLabel}`;
  $('#presenterNotes').textContent = item.notes?.[String(presenterIndex)] || 'No speaker notes were found for this slide.';
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

$('#search').addEventListener('input', () => {
  clearTimeout(onlineSearchTimer);
  const query = $('#search').value.trim();
  if (tab === 'online') {
    onlineSearchRequest += 1; // Ignore any older search while the user is still typing.
    if (query.length < 2) {
      onlineResults = [];
      $('#onlineSearchButton').disabled = false;
      $('#onlineStatus').textContent = 'Type at least two characters. Search will start automatically.';
      renderOnlineResults();
      return;
    }
    $('#onlineStatus').textContent = 'Searching automatically…';
    onlineSearchTimer = setTimeout(() => searchOnline(), 650);
    return;
  }

  renderLibrary();
  if (tab !== 'songs' || query.length < 2) return;
  // Only suppress online lookup when the complete title is already saved.
  // Fuzzy lyric/body matches must not block a search for an unsaved song title.
  const normalizedQuery = normalize(query);
  const exactLocalTitle = data.items.some((item) =>
    item.type === 'song' && normalize(item.title) === normalizedQuery
  );
  if (exactLocalTitle) return;
  onlineSearchTimer = setTimeout(() => {
    if ($('#search').value.trim() !== query || tab !== 'songs') return;
    tab = 'online';
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    onlineResults = [];
    renderLibrary();
    searchOnline();
  }, 500);
});
$('#search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && tab === 'online') {
    event.preventDefault();
    clearTimeout(onlineSearchTimer);
    searchOnline();
  }
});
$('#onlineSearchButton').onclick = searchOnline;
$('#importOpenLyrics').onclick = importOpenLyrics;

document.querySelectorAll('.tab').forEach((button) => {
  button.onclick = () => {
    tab = button.dataset.tab;
    document.querySelectorAll('.tab').forEach((other) => other.classList.toggle('active', other === button));
    renderLibrary();
  };
});

$('#addSong').onclick = () => addItem('song');
$('#editSelectedSong').onclick = () => {
  const item = current();
  if (!item || item.type !== 'song') return;
  editingId = item.id;
  $('#editorTitle').textContent = 'Edit song lyrics';
  $('#itemTitle').value = item.title || '';
  $('#itemBody').value = item.body || '';
  $('#editor').dataset.type = 'song';
  $('#editor').showModal();
};
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
$('#nextSlide').onclick = async () => {
  const item = current();
  slideIndex = Math.min(slides(item).length - 1, slideIndex + 1);
  if (item?.type === 'song') {
    // For lyrics, advancing the preview also sends that lyric slide to the program output.
    liveItem = JSON.parse(JSON.stringify(item));
    liveIndex = slideIndex;
    liveBlank = false;
    render();
    await sendDisplays();
    return;
  }
  render();
};
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
$('#ndiAccess').onclick = () => $('#ndiCard').scrollIntoView({ behavior: 'smooth', block: 'start' });

$('#outputMode').value = data.outputMode === 'lower-third' ? 'lower-third' : 'full';
$('#lyricsLinesPerSlide').value = String(Math.max(1, Math.min(8, Number(data.lyricsLinesPerSlide) || 4)));
$('#lyricsLinesPerSlide').onchange = async () => {
  data.lyricsLinesPerSlide = Math.max(1, Math.min(8, Number($('#lyricsLinesPerSlide').value) || 4));
  if (current()) slideIndex = Math.min(slideIndex, slides(current()).length - 1);
  if (liveItem) liveIndex = Math.min(liveIndex, slides(liveItem).length - 1);
  save(); render(); await sendDisplays();
};
function refreshBackgroundControls() {
  const background = data.background;
  $('#backgroundStatus').textContent = background ? `Selected: ${background.name} · ${background.type}` : 'No custom background selected.';
  $('#removeBackground').hidden = !background;
}
$('#chooseBackground').onclick = async () => {
  try {
    const background = await window.churchflowDesktop.importBackground();
    if (!background) return;
    data.background = background;
    backgroundImageCache = null; backgroundVideoReadyUrl = null;
    const video = $('#backgroundVideo');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    if (background.type === 'video') {
      video.src = background.url; video.loop = true; video.muted = true; video.playsInline = true;
      await video.play().catch(() => {});
      if (backgroundRefreshTimer) clearInterval(backgroundRefreshTimer);
      backgroundRefreshTimer = setInterval(() => {
        if (liveItem && !liveBlank && data.background?.type === 'video') sendDisplays().catch(console.warn);
      }, 1000 / 24);
    } else if (backgroundRefreshTimer) { clearInterval(backgroundRefreshTimer); backgroundRefreshTimer = null; }
    save(); refreshBackgroundControls(); render(); await sendDisplays();
  } catch (error) { alert(error.message || 'Could not import that background.'); }
};
$('#removeBackground').onclick = async () => {
  data.background = null; backgroundImageCache = null; backgroundVideoReadyUrl = null;
  if (backgroundRefreshTimer) clearInterval(backgroundRefreshTimer); backgroundRefreshTimer = null;
  const video = $('#backgroundVideo'); if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  save(); refreshBackgroundControls(); render(); await sendDisplays();
};
refreshBackgroundControls();
$('#outputMode').onchange = async () => {
  data.outputMode = $('#outputMode').value === 'lower-third' ? 'lower-third' : 'full';
  if (current()) slideIndex = Math.min(slideIndex, slides(current()).length - 1);
  if (liveItem) liveIndex = Math.min(liveIndex, slides(liveItem).length - 1);
  save();
  render();
  await sendDisplays();
};
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
  const item = liveItem?.type === 'presentation' ? liveItem : current();
  if (item?.type !== 'presentation') return;
  if (item === current() || item.id === current()?.id) slideIndex = liveIndex;
  $('#presenterDialog').showModal();
  try {
    // Opening Presenter View is read-only: it must never change audience output.
    await updatePresenterView();
  } catch (error) { $('#presenterStatus').textContent = error.message; }
};
$('#closePresenter').onclick = () => $('#presenterDialog').close();
async function movePresenterSlide(direction) {
  const isLivePresentation = liveItem?.type === 'presentation';
  const item = isLivePresentation ? liveItem : current();
  if (item?.type !== 'presentation') return;
  if (isLivePresentation) {
    liveIndex = Math.max(0, Math.min(slides(liveItem).length - 1, liveIndex + direction));
    if (current()?.id === liveItem.id) slideIndex = liveIndex;
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
    else { await window.churchflowDesktop.downloadUpdate(); }
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
  const providerName = loadedOnlineHymn.source || 'lyrics provider';
  const accepted = confirm(`Only import and project these lyrics if your church's licence or public-domain status permits it. ${providerName} access alone does not necessarily grant offline storage or projection rights. Continue?`);
  if (!accepted) return;
  const id = `online-${Date.now()}`;
  data.items.push({ id, type: 'song', title: loadedOnlineHymn.title, body: loadedOnlineHymn.body, source: loadedOnlineHymn.source || providerName, sourceUrl: loadedOnlineHymn.sourceUrl, lyricRightsConfirmed: true });
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
  if (isTyping || $('#editor').open || $('#onlineHymnDialog').open) return;
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

// Keep the branded splash visible while the initial workspace is rendered.
window.addEventListener('load', () => {
  window.setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.classList.add('is-hidden');
      window.setTimeout(() => splash.remove(), 500);
    }
  }, 650);
}, { once: true });
