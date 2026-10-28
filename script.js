/* =================================================================
   HARXORA VIBEZ — Premium Personal Music Player
   Pure Vanilla JS · Offline-First Architecture · IndexedDB · PWA
   ================================================================= */

'use strict';

/* ============== UTILITIES ============== */
const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => [...parent.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const fmtTime = (sec) => {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const fmtDurationLong = (sec) => {
  if (!sec || !isFinite(sec)) return '0 min';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const escapeHtml = (str) =>
  (str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

/* ============== INDEXEDDB PERSISTENCE LAYER ============== */
const DB_NAME = 'harxora-vibez-db';
const DB_VERSION = 2;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('favorites')) d.createObjectStore('favorites', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('history')) d.createObjectStore('history', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('lyrics')) d.createObjectStore('lyrics', { keyPath: 'songId' });
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    req.onerror = (e) => reject(e);
  });
}

function idbPut(store, value) {
  return new Promise((res, rej) => {
    if (!db) return res();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => res();
    tx.onerror = (e) => rej(e);
  });
}

function idbGet(store, key) {
  return new Promise((res, rej) => {
    if (!db) return res(null);
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = (e) => rej(e);
  });
}

function idbAll(store) {
  return new Promise((res, rej) => {
    if (!db) return res([]);
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = (e) => rej(e);
  });
}

function idbDel(store, key) {
  return new Promise((res, rej) => {
    if (!db) return res();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = (e) => rej(e);
  });
}

function idbClear(store) {
  return new Promise((res, rej) => {
    if (!db) return res();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => res();
    tx.onerror = (e) => rej(e);
  });
}

/* ============== STATE ============== */
const State = {
  songs: [], // Array of metadata objects
  playlists: [], // [{ id, name, songIds: [] }]
  favorites: [], // [songId]
  recent: [], // [songId]
  history: [], // [{ id, songId, timestamp, duration }]
  queue: [], // [songId]
  originalQueue: [], // [songId] unshuffled sequence for clean restoration
  queueIndex: -1,
  currentSong: null,
  currentLyrics: null, // { isLrc, lines: [{ time, text }] } or null
  isPlaying: false,
  shuffle: false,
  repeat: 'off', // 'off' | 'one' | 'all'
  settings: {
    theme: 'dark',
    playerStyle: 'glass', // 'glass' | 'immersive' | 'minimal' | 'transparent' | 'dynamic' | 'classic'
    accent: '#7c5cff',
    blur: 30,
    dim: 55,
    animations: true,
    visualizer: true,
    vizMode: 'bars', // 'bars' | 'wave' | 'radial' | 'minimal'
    rotateArt: true,
    autoplay: true,
    mediaSession: true,
    wallpaper: null,
    volume: 0.8,
    speed: 1,
    totalPlaySeconds: 0,
  },
  sleepTimerId: null,
  sleepEndTs: null,
  blobUrls: new Map(),
  colorCache: new Map(),
  deferredInstallPrompt: null,
};

const LS_KEY = 'harxora-vibez-state-v2';

/* Migration helper from legacy DB and localStorage */
async function checkAndMigrateLegacy() {
  try {
    // 1. Check legacy localStorage
    const legacyRaw = localStorage.getItem('aurora-state-v1');
    if (legacyRaw) {
      const data = JSON.parse(legacyRaw);
      if (data.playlists?.length) State.playlists = data.playlists;
      if (data.favorites?.length) State.favorites = data.favorites;
      if (data.recent?.length) State.recent = data.recent;
      if (data.settings) State.settings = { ...State.settings, ...data.settings };
      // Save into new structure
      persistState();
    }

    // 2. Check legacy IndexedDB 'aurora-music'
    const databases = await indexedDB.databases?.();
    const legacyExists = databases && databases.some((d) => d.name === 'aurora-music');
    if (legacyExists) {
      const oldReq = indexedDB.open('aurora-music', 1);
      oldReq.onsuccess = async (e) => {
        const oldDb = e.target.result;
        try {
          if (oldDb.objectStoreNames.contains('meta')) {
            const tx = oldDb.transaction('meta', 'readonly');
            const metas = await new Promise((r) => {
              const req = tx.objectStore('meta').getAll();
              req.onsuccess = () => r(req.result || []);
            });
            for (const m of metas) {
              await idbPut('meta', m);
            }
          }
          if (oldDb.objectStoreNames.contains('files')) {
            const tx2 = oldDb.transaction('files', 'readonly');
            const files = await new Promise((r) => {
              const req = tx2.objectStore('files').getAll();
              req.onsuccess = () => r(req.result || []);
            });
            for (const f of files) {
              await idbPut('files', f);
            }
          }
        } catch (err) {
          console.warn('Migration completed with partial items', err);
        }
      };
    }
  } catch (err) {
    console.warn('Legacy migration check bypassed', err);
  }
}

function persistState() {
  const data = {
    playlists: State.playlists,
    favorites: State.favorites,
    recent: State.recent.slice(0, 30),
    settings: State.settings,
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Persist failed', e);
  }
  // Also persist playlists, favorites, and settings into IndexedDB for durability
  idbPut('settings', { key: 'main_state', data });
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    State.playlists = data.playlists || [];
    State.favorites = data.favorites || [];
    State.recent = data.recent || [];
    State.settings = { ...State.settings, ...(data.settings || {}) };
  } catch (e) {
    console.warn('Could not load persisted state', e);
  }
}

/* ============== AUDIO ENGINE & MEDIA SESSION ============== */
const audio = new Audio();
audio.preload = 'metadata';
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let vizRAF = null;

function ensureAudioGraph() {
  if (audioCtx) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioCtx = new AudioCtx();
    sourceNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  } catch (e) {
    console.warn('Web Audio API initialized with standard destination', e);
  }
}

function getBlobUrl(song) {
  if (State.blobUrls.has(song.id)) return Promise.resolve(State.blobUrls.get(song.id));
  return idbGet('files', song.id).then((rec) => {
    if (!rec || !rec.blob) return null;
    const url = URL.createObjectURL(rec.blob);
    State.blobUrls.set(song.id, url);
    return url;
  });
}

/* Setup Media Session API for lockscreen & hardware media keys */
function updateMediaSession(song) {
  if (!('mediaSession' in navigator) || !State.settings.mediaSession || !song) return;
  try {
    const artwork = [];
    if (song.art) {
      artwork.push({ src: song.art, sizes: '96x96', type: 'image/jpeg' });
      artwork.push({ src: song.art, sizes: '128x128', type: 'image/jpeg' });
      artwork.push({ src: song.art, sizes: '192x192', type: 'image/jpeg' });
      artwork.push({ src: song.art, sizes: '256x256', type: 'image/jpeg' });
      artwork.push({ src: song.art, sizes: '384x384', type: 'image/jpeg' });
      artwork.push({ src: song.art, sizes: '512x512', type: 'image/jpeg' });
    } else {
      artwork.push({ src: 'assets/icons/neon-h-music-wave-icon.png', sizes: '512x512', type: 'image/png' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title || 'Unknown Title',
      artist: song.artist || 'Unknown Artist',
      album: song.album || 'Unknown Album',
      artwork,
    });

    navigator.mediaSession.playbackState = State.isPlaying ? 'playing' : 'paused';

    const safeSetAction = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {}
    };

    safeSetAction('play', () => audio.play());
    safeSetAction('pause', () => audio.pause());
    safeSetAction('previoustrack', () => prevTrack());
    safeSetAction('nexttrack', () => nextTrack());
    safeSetAction('seekto', (details) => {
      if (details.seekTime !== undefined && isFinite(details.seekTime)) audio.currentTime = details.seekTime;
    });
    safeSetAction('seekbackward', (details) => {
      const skip = details.seekOffset || 10;
      audio.currentTime = Math.max(0, audio.currentTime - skip);
    });
    safeSetAction('seekforward', (details) => {
      const skip = details.seekOffset || 10;
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + skip);
    });
    safeSetAction('stop', () => {
      audio.pause();
      audio.currentTime = 0;
    });
  } catch (e) {
    console.warn('MediaSession update skipped', e);
  }
}

function updateMediaSessionPosition() {
  if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
  try {
    if (audio.duration && isFinite(audio.duration)) {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: audio.currentTime,
      });
    }
  } catch (e) {}
}

/* ============== METADATA EXTRACTION (ID3, Vorbis, MP4) ============== */
async function readMetadata(file) {
  const meta = {
    title: '',
    artist: '',
    album: '',
    genre: '',
    year: '',
    trackNo: '',
    duration: 0,
    art: null,
  };

  // 1. Get duration via temporary audio element
  try {
    const url = URL.createObjectURL(file);
    const testAudio = new Audio();
    testAudio.preload = 'metadata';
    const durationPromise = new Promise((resolve) => {
      testAudio.onloadedmetadata = () => {
        const d = testAudio.duration || 0;
        URL.revokeObjectURL(url);
        resolve(d);
      };
      testAudio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(0);
      }, 4000);
    });
    testAudio.src = url;
    meta.duration = await durationPromise;
  } catch (e) {}

  // 2. Parse tag formats depending on file extension / type
  try {
    if (/\.mp3$/i.test(file.name) || file.type === 'audio/mpeg') {
      const id3 = await parseID3(file);
      Object.assign(meta, id3);
    } else if (/\.(m4a|aac|mp4)$/i.test(file.name)) {
      const m4a = await parseM4A(file);
      Object.assign(meta, m4a);
    } else if (/\.(flac|ogg)$/i.test(file.name)) {
      const vorbis = await parseVorbis(file);
      Object.assign(meta, vorbis);
    }
  } catch (e) {
    console.warn('Tag parsing fallback for', file.name, e);
  }

  // Fallback defaults
  if (!meta.title) meta.title = file.name.replace(/\.[^.]+$/, '');
  if (!meta.artist) meta.artist = 'Unknown Artist';
  if (!meta.album) meta.album = 'Unknown Album';
  if (!meta.genre) meta.genre = 'Local Audio';

  return meta;
}

/* ID3v2 parser for MP3 */
async function parseID3(file) {
  const out = {};
  try {
    const buf = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const dv = new DataView(buf);
    if (dv.getUint8(0) !== 0x49 || dv.getUint8(1) !== 0x44 || dv.getUint8(2) !== 0x33) return out;
    const versionMajor = dv.getUint8(3);
    const size =
      ((dv.getUint8(6) & 0x7f) << 21) |
      ((dv.getUint8(7) & 0x7f) << 14) |
      ((dv.getUint8(8) & 0x7f) << 7) |
      (dv.getUint8(9) & 0x7f);
    let offset = 10;
    const end = Math.min(10 + size, buf.byteLength);
    const tdUtf8 = new TextDecoder('utf-8');
    const tdUtf16 = new TextDecoder('utf-16');

    while (offset + 10 < end) {
      const frameId = String.fromCharCode(
        dv.getUint8(offset),
        dv.getUint8(offset + 1),
        dv.getUint8(offset + 2),
        dv.getUint8(offset + 3)
      );
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
      let fSize;
      if (versionMajor === 4) {
        fSize =
          ((dv.getUint8(offset + 4) & 0x7f) << 21) |
          ((dv.getUint8(offset + 5) & 0x7f) << 14) |
          ((dv.getUint8(offset + 6) & 0x7f) << 7) |
          (dv.getUint8(offset + 7) & 0x7f);
      } else {
        fSize =
          (dv.getUint8(offset + 4) << 24) |
          (dv.getUint8(offset + 5) << 16) |
          (dv.getUint8(offset + 6) << 8) |
          dv.getUint8(offset + 7);
      }
      const dataStart = offset + 10;
      const dataEnd = dataStart + fSize;
      if (fSize <= 0 || dataEnd > end) break;

      const enc = dv.getUint8(dataStart);
      const slice = buf.slice(dataStart + 1, dataEnd);
      let text = enc === 1 || enc === 2 ? tdUtf16.decode(slice) : tdUtf8.decode(slice);
      text = text.replace(/\u0000+$/, '').replace(/^\uFEFF/, '').trim();

      if (frameId === 'TIT2') out.title = text;
      else if (frameId === 'TPE1' || frameId === 'TPE2') out.artist = text;
      else if (frameId === 'TALB') out.album = text;
      else if (frameId === 'TCON') out.genre = text;
      else if (frameId === 'TYER' || frameId === 'TDRC') out.year = text.slice(0, 4);
      else if (frameId === 'TRCK') out.trackNo = text.split('/')[0];
      else if (frameId === 'APIC' && !out.art) {
        let p = dataStart + 1;
        let mimeEnd = p;
        while (mimeEnd < dataEnd && dv.getUint8(mimeEnd) !== 0) mimeEnd++;
        const mime = tdUtf8.decode(buf.slice(p, mimeEnd)) || 'image/jpeg';
        p = mimeEnd + 2; // skip mime null byte and pic type
        if (enc === 1 || enc === 2) {
          while (p + 1 < dataEnd && !(dv.getUint8(p) === 0 && dv.getUint8(p + 1) === 0)) p += 2;
          p += 2;
        } else {
          while (p < dataEnd && dv.getUint8(p) !== 0) p++;
          p += 1;
        }
        const imgBytes = new Uint8Array(buf.slice(p, dataEnd));
        out.art = await makeArtThumb(new Blob([imgBytes], { type: mime }));
      }
      offset = dataEnd;
    }
  } catch (e) {}
  return out;
}

/* MP4/M4A Atom metadata parser */
async function parseM4A(file) {
  const out = {};
  try {
    const buf = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const dv = new DataView(buf);
    const td = new TextDecoder('utf-8');
    const len = buf.byteLength;
    let offset = 0;

    // Search for 'moov' -> 'udta' -> 'meta' -> 'ilst'
    while (offset + 8 < len) {
      const boxSize = dv.getUint32(offset);
      const boxType = String.fromCharCode(
        dv.getUint8(offset + 4),
        dv.getUint8(offset + 5),
        dv.getUint8(offset + 6),
        dv.getUint8(offset + 7)
      );
      if (boxSize < 8 || offset + boxSize > len) break;

      if (boxType === 'moov' || boxType === 'udta' || boxType === 'ilst') {
        offset += 8;
        continue;
      } else if (boxType === 'meta') {
        offset += 12; // skip version/flags
        continue;
      }

      // Check standard tags inside 'ilst'
      if (boxType === '©nam' || boxType === '©ART' || boxType === '©alb' || boxType === '©day' || boxType === '©gen') {
        const dataBoxOffset = offset + 8;
        if (dataBoxOffset + 16 < len) {
          const dataLen = dv.getUint32(dataBoxOffset);
          const dataText = td.decode(buf.slice(dataBoxOffset + 16, dataBoxOffset + dataLen)).trim();
          if (boxType === '©nam') out.title = dataText;
          if (boxType === '©ART') out.artist = dataText;
          if (boxType === '©alb') out.album = dataText;
          if (boxType === '©day') out.year = dataText.slice(0, 4);
          if (boxType === '©gen') out.genre = dataText;
        }
      } else if (boxType === 'covr' && !out.art) {
        const dataBoxOffset = offset + 8;
        if (dataBoxOffset + 16 < len) {
          const dataLen = dv.getUint32(dataBoxOffset);
          const imgBytes = new Uint8Array(buf.slice(dataBoxOffset + 16, dataBoxOffset + dataLen));
          out.art = await makeArtThumb(new Blob([imgBytes], { type: 'image/jpeg' }));
        }
      }
      offset += boxSize;
    }
  } catch (e) {}
  return out;
}

/* Vorbis Comment parser for FLAC / OGG */
async function parseVorbis(file) {
  const out = {};
  try {
    const buf = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
    const td = new TextDecoder('utf-8');
    const text = td.decode(buf);

    const matches = text.match(/(?:TITLE|ARTIST|ALBUM|GENRE|DATE|TRACKNUMBER)=([^\x00-\x1F\x7F]+)/gi);
    if (matches) {
      matches.forEach((m) => {
        const [k, v] = m.split('=');
        const key = k.toUpperCase();
        if (key === 'TITLE' && !out.title) out.title = v.trim();
        else if (key === 'ARTIST' && !out.artist) out.artist = v.trim();
        else if (key === 'ALBUM' && !out.album) out.album = v.trim();
        else if (key === 'GENRE' && !out.genre) out.genre = v.trim();
        else if (key === 'DATE' && !out.year) out.year = v.slice(0, 4);
        else if (key === 'TRACKNUMBER' && !out.trackNo) out.trackNo = v.trim();
      });
    }
  } catch (e) {}
  return out;
}

/* Downscale artwork thumbnail to save memory */
function makeArtThumb(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/* ============== FILE IMPORT SYSTEM ============== */
async function importFiles(fileList) {
  const rawFiles = [...fileList];
  if (!rawFiles.length) return;

  // Separate audio and lyrics files
  const audioFiles = rawFiles.filter(
    (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name)
  );
  const lyricsFiles = rawFiles.filter((f) => /\.(lrc|txt)$/i.test(f.name));

  if (lyricsFiles.length && !audioFiles.length) {
    for (const lf of lyricsFiles) {
      await handleLyricsFileUpload(lf);
    }
    return;
  }

  if (!audioFiles.length) {
    toast('No supported audio files found');
    return;
  }

  showImportModal(audioFiles.length);

  let successCount = 0;
  let dupCount = 0;
  let failedCount = 0;

  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    updateImportProgress(i + 1, audioFiles.length, file.name);

    // Duplicate detection: check filename and file size
    const isDup = State.songs.some((s) => s.fileName === file.name && s.size === file.size);
    if (isDup) {
      dupCount++;
      continue;
    }

    try {
      const id = uid();
      const meta = await readMetadata(file);
      const song = {
        id,
        title: meta.title || file.name.replace(/\.[^.]+$/, ''),
        artist: meta.artist || 'Unknown Artist',
        album: meta.album || 'Unknown Album',
        genre: meta.genre || 'Local Audio',
        year: meta.year || '',
        trackNo: meta.trackNo || '',
        duration: meta.duration || 0,
        addedAt: Date.now(),
        art: meta.art || null,
        fileName: file.name,
        size: file.size,
        playCount: 0,
        lastPlayed: null,
      };

      await idbPut('files', { id, blob: file });
      await idbPut('meta', song);
      State.songs.push(song);
      successCount++;
    } catch (e) {
      console.warn('Import failed for', file.name, e);
      failedCount++;
    }
  }

  // Handle any accompanying lyrics files
  for (const lf of lyricsFiles) {
    await handleLyricsFileUpload(lf);
  }

  persistState();
  renderAll();
  updateStorageMetrics();

  finishImportModal(successCount, dupCount, failedCount);
}

function showImportModal(total) {
  $('#import-modal').classList.add('open');
  $('#import-modal-title').textContent = 'Importing Music…';
  $('#import-modal-body').innerHTML = `
    <p id="import-modal-status" class="muted">Processing 0 of ${total} files…</p>
    <div class="progress-bar-container" style="margin:16px 0;">
      <div class="progress-bar-fill" id="import-progress-fill" style="width:0%;"></div>
    </div>`;
  $('#import-modal-actions').style.display = 'none';
}

function updateImportProgress(current, total, filename) {
  const pct = Math.round((current / total) * 100);
  const fill = $('#import-progress-fill');
  const status = $('#import-modal-status');
  if (fill) fill.style.width = pct + '%';
  if (status) status.textContent = `(${current}/${total}) ${filename}`;
}

function finishImportModal(success, dups, failed) {
  $('#import-modal-title').textContent = 'Import Complete';
  $('#import-modal-body').innerHTML = `
    <div style="font-size:0.95rem; line-height:1.6; margin:8px 0 16px;">
      <p style="color:var(--text);"><strong>${success}</strong> song${success !== 1 ? 's' : ''} added successfully.</p>
      ${dups > 0 ? `<p class="muted"><strong>${dups}</strong> duplicate file${dups !== 1 ? 's' : ''} skipped.</p>` : ''}
      ${failed > 0 ? `<p style="color:var(--danger);"><strong>${failed}</strong> file${failed !== 1 ? 's' : ''} failed or unsupported.</p>` : ''}
    </div>`;
  $('#import-modal-actions').style.display = 'flex';
  $('#import-modal-done').onclick = () => $('#import-modal').classList.remove('open');
}

/* ============== SYNCHRONIZED LYRICS ENGINE ============== */
function parseLRC(text) {
  if (!text) return { isLrc: false, lines: [] };
  const lines = [];
  const rawLines = text.split('\n');
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  let hasTimestamp = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let match;
    const timestamps = [];
    while ((match = timeRegex.exec(trimmed)) !== null) {
      hasTimestamp = true;
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseFloat('0.' + match[3]) : 0;
      timestamps.push(min * 60 + sec + ms);
    }
    const cleanText = trimmed.replace(timeRegex, '').trim();
    if (timestamps.length) {
      for (const t of timestamps) {
        lines.push({ time: t, text: cleanText });
      }
    } else {
      lines.push({ time: -1, text: trimmed });
    }
  }

  if (hasTimestamp) {
    lines.sort((a, b) => a.time - b.time);
    return { isLrc: true, lines };
  }
  return { isLrc: false, lines };
}

async function loadLyricsForSong(songId) {
  const rec = await idbGet('lyrics', songId);
  const container = $('#lyrics-lines');
  const empty = $('#lyrics-empty');
  const badge = $('#lyrics-sync-badge');

  if (!rec || !rec.text) {
    State.currentLyrics = null;
    container.style.display = 'none';
    empty.style.display = 'block';
    badge.textContent = 'No Lyrics';
    badge.style.background = 'rgba(255,255,255,0.06)';
    badge.style.color = 'var(--text-dim)';
    return;
  }

  const parsed = parseLRC(rec.text);
  State.currentLyrics = parsed;

  badge.textContent = parsed.isLrc ? 'LRC Synced' : 'Text Lyrics';
  badge.style.background = parsed.isLrc ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(255,255,255,0.1)';
  badge.style.color = parsed.isLrc ? 'var(--accent)' : 'var(--text)';

  empty.style.display = 'none';
  container.style.display = 'flex';
  container.innerHTML = parsed.lines
    .map((line, idx) => `<div class="lyric-line" data-idx="${idx}" data-time="${line.time}">${escapeHtml(line.text || '♪')}</div>`)
    .join('');

  // Click on lyric line to seek audio
  $$('.lyric-line', container).forEach((el) => {
    el.onclick = () => {
      const t = parseFloat(el.dataset.time);
      if (t >= 0 && audio.duration) {
        audio.currentTime = t;
        if (audio.paused) audio.play();
      }
    };
  });
}

function updateLyricsHighlight(currTime) {
  if (!State.currentLyrics || !State.currentLyrics.isLrc) return;
  const lines = State.currentLyrics.lines;
  let activeIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currTime + 0.15) {
      activeIdx = i;
    } else {
      break;
    }
  }

  const container = $('#lyrics-lines');
  const elList = $$('.lyric-line', container);
  elList.forEach((el, idx) => {
    const isActive = idx === activeIdx;
    el.classList.toggle('active', isActive);
  });

  if (activeIdx >= 0 && elList[activeIdx]) {
    const activeEl = elList[activeIdx];
    const scrollArea = $('#lyrics-scroll-area');
    const scrollTarget = activeEl.offsetTop - scrollArea.clientHeight / 2 + activeEl.clientHeight / 2;
    scrollArea.scrollTo({ top: scrollTarget, behavior: 'smooth' });
  }
}

async function handleLyricsFileUpload(file) {
  const text = await file.text();
  const nameClean = file.name.replace(/\.[^.]+$/, '').toLowerCase();
  // Find matching song in library by filename or title
  const match = State.songs.find(
    (s) =>
      s.fileName.replace(/\.[^.]+$/, '').toLowerCase() === nameClean ||
      s.title.toLowerCase() === nameClean
  );
  if (match) {
    await idbPut('lyrics', { songId: match.id, text });
    if (State.currentSong?.id === match.id) loadLyricsForSong(match.id);
    toast(`Lyrics matched to "${match.title}"`);
  } else if (State.currentSong) {
    await idbPut('lyrics', { songId: State.currentSong.id, text });
    loadLyricsForSong(State.currentSong.id);
    toast(`Lyrics attached to current track`);
  } else {
    toast(`Lyrics imported (${file.name})`);
  }
}

function showLyricsEditor() {
  if (!State.currentSong) {
    toast('Play a song first to attach lyrics');
    return;
  }
  idbGet('lyrics', State.currentSong.id).then((rec) => {
    const existing = rec?.text || '';
    const body = `
      <p class="muted" style="margin-bottom:8px;">Paste LRC formatted timestamps <code>[mm:ss.xx]</code> or plain text lyrics.</p>
      <textarea id="lyrics-edit-textarea" rows="12" class="glass-input" style="resize:vertical;" placeholder="[00:15.20]First line of lyrics...&#10;[00:20.50]Second line...">${escapeHtml(existing)}</textarea>
      <div style="margin-top:10px; display:flex; justify-content:space-between;">
        <button class="btn-ghost small-btn danger" id="btn-delete-lyrics">Clear Lyrics</button>
      </div>`;
    openModal(`Lyrics for "${State.currentSong.title}"`, body, async () => {
      const text = $('#lyrics-edit-textarea').value.trim();
      if (text) {
        await idbPut('lyrics', { songId: State.currentSong.id, text });
      } else {
        await idbDel('lyrics', State.currentSong.id);
      }
      loadLyricsForSong(State.currentSong.id);
      closeModal();
      toast('Lyrics updated');
    });

    $('#btn-delete-lyrics').onclick = async () => {
      await idbDel('lyrics', State.currentSong.id);
      loadLyricsForSong(State.currentSong.id);
      closeModal();
      toast('Lyrics deleted');
    };
  });
}

/* ============== RENDERING VIEWS ============== */
function renderAll() {
  renderHome();
  renderSongs();
  renderAlbums();
  renderArtists();
  renderPlaylists();
  renderFavorites();
  renderStatistics();
  updateMini();
}

function emptyHomeCardHTML(iconSvg, title, subtitle) {
  return `
    <div class="empty-section-card">
      ${iconSvg}
      <div>
        <h4>${title}</h4>
        <p>${subtitle}</p>
      </div>
    </div>`;
}

/* ----- Home Dashboard ----- */
function renderHome() {
  // Greeting
  const h = new Date().getHours();
  const greet =
    h < 5
      ? 'Good night'
      : h < 12
      ? 'Good morning'
      : h < 17
      ? 'Good afternoon'
      : h < 22
      ? 'Good evening'
      : 'Good night';
  $('#greeting').textContent = greet;

  // Recently Played
  const recentRow = $('#recent-row');
  const recents = State.recent
    .map((id) => State.songs.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, 12);
  if (recents.length) {
    recentRow.innerHTML = recents.map((s) => songCardHTML(s)).join('');
  } else {
    recentRow.innerHTML = emptyHomeCardHTML(
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'No recent plays yet',
      'Start playing any song from your library to build your history.'
    );
  }
  attachCardClicks(recentRow, 'song');

  // Favorites
  const favRow = $('#fav-row');
  const favs = State.favorites
    .map((id) => State.songs.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, 12);
  if (favs.length) {
    favRow.innerHTML = favs.map((s) => songCardHTML(s)).join('');
  } else {
    favRow.innerHTML = emptyHomeCardHTML(
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>',
      'No favorites saved',
      'Click the heart icon on any song to save it to your favorites.'
    );
  }
  attachCardClicks(favRow, 'song');

  // Playlists
  const plRow = $('#playlists-row');
  if (State.playlists.length) {
    plRow.innerHTML = State.playlists.slice(0, 12).map((p) => playlistCardHTML(p)).join('');
  } else {
    plRow.innerHTML = emptyHomeCardHTML(
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h10M4 18h10M18 14v7M15 17l3-3 3 3"/></svg>',
      'No custom playlists',
      'Create your first playlist to organize songs by mood or genre.'
    );
  }
  attachCardClicks(plRow, 'playlist');

  // Recently Added
  const addedRow = $('#recently-added-row');
  const added = [...State.songs].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  if (added.length) {
    addedRow.innerHTML = added.map((s) => songCardHTML(s)).join('');
  } else {
    addedRow.innerHTML = emptyHomeCardHTML(
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
      'Library is empty',
      'Add songs or music folders using the Add Music button to begin.'
    );
  }
  attachCardClicks(addedRow, 'song');

  // Local Recommendations / Shuffle mix
  const recRow = $('#recommended-row');
  if (State.songs.length) {
    const sample = [...State.songs].sort(() => Math.random() - 0.5).slice(0, 12);
    recRow.innerHTML = sample.map((s) => songCardHTML(s)).join('');
  } else {
    recRow.innerHTML = emptyHomeCardHTML(
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
      'No suggestions yet',
      'Import audio files to unlock personalized offline mixes.'
    );
  }
  attachCardClicks(recRow, 'song');
}

function songCardHTML(s) {
  const art = s.art ? `style="background-image:url('${s.art}')"` : '';
  return `
    <div class="card" data-id="${s.id}">
      <div class="card-art" ${art}>
        ${!s.art ? `<svg class="card-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>` : ''}
        <div class="card-play" aria-label="Play song"><svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
      </div>
      <div class="card-title">${escapeHtml(s.title)}</div>
      <div class="card-sub">${escapeHtml(s.artist)}</div>
    </div>`;
}

function playlistCardHTML(p) {
  const songs = p.songIds.map((id) => State.songs.find((s) => s.id === id)).filter(Boolean);
  const art = songs.find((s) => s.art)?.art;
  const bg = art ? `style="background-image:url('${art}')"` : '';
  return `
    <div class="card" data-id="${p.id}">
      <div class="card-art" ${bg}>
        ${!art ? `<svg class="card-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h10M4 18h10M18 14v7M15 17l3-3 3 3"/></svg>` : ''}
        <div class="card-play" aria-label="Play playlist"><svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
      </div>
      <div class="card-title">${escapeHtml(p.name)}</div>
      <div class="card-sub">${p.songIds.length} song${p.songIds.length !== 1 ? 's' : ''}</div>
    </div>`;
}

function albumCardHTML(album, songs) {
  const art = songs.find((s) => s.art)?.art;
  const bg = art ? `style="background-image:url('${art}')"` : '';
  return `
    <div class="card" data-id="${encodeURIComponent(album)}">
      <div class="card-art" ${bg}>
        ${!art ? `<svg class="card-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>` : ''}
        <div class="card-play" aria-label="Play album"><svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
      </div>
      <div class="card-title">${escapeHtml(album)}</div>
      <div class="card-sub">${songs.length} song${songs.length !== 1 ? 's' : ''}</div>
    </div>`;
}

function artistCardHTML(artist, songs) {
  const art = songs.find((s) => s.art)?.art;
  const bgStyle = art ? `background-image:url('${art}');` : '';
  const albums = new Set(songs.map((s) => s.album)).size;
  return `
    <div class="card" data-id="${encodeURIComponent(artist)}">
      <div class="card-art" style="border-radius:50%; ${bgStyle}">
        ${!art ? `<svg class="card-icon" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>` : ''}
      </div>
      <div class="card-title">${escapeHtml(artist)}</div>
      <div class="card-sub">${songs.length} song${songs.length !== 1 ? 's' : ''} · ${albums} album${albums !== 1 ? 's' : ''}</div>
    </div>`;
}

function attachCardClicks(container, kind) {
  $$('.card', container).forEach((card) => {
    card.onclick = () => {
      const id = card.dataset.id;
      if (kind === 'song') {
        const song = State.songs.find((s) => s.id === id);
        if (song) {
          const ids = $$('.card', container)
            .map((c) => c.dataset.id)
            .filter((x) => State.songs.find((s) => s.id === x));
          playSong(song.id, ids);
        }
      } else if (kind === 'playlist') {
        openPlaylistDetail(id);
      } else if (kind === 'album') {
        openAlbumDetail(decodeURIComponent(id));
      } else if (kind === 'artist') {
        openArtistDetail(decodeURIComponent(id));
      }
    };
  });
}

/* ----- Songs List ----- */
function sortSongs(list, mode) {
  const arr = [...list];
  switch (mode) {
    case 'az':
      arr.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'za':
      arr.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case 'artist':
      arr.sort((a, b) => a.artist.localeCompare(b.artist));
      break;
    case 'album':
      arr.sort((a, b) => a.album.localeCompare(b.album));
      break;
    case 'duration':
      arr.sort((a, b) => (b.duration || 0) - (a.duration || 0));
      break;
    case 'mostplayed':
      arr.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      break;
    case 'recent':
    default:
      arr.sort((a, b) => b.addedAt - a.addedAt);
      break;
  }
  return arr;
}

function renderSongs() {
  const list = $('#songs-list');
  const countSub = $('#songs-count-sub');
  if (countSub) countSub.textContent = `${State.songs.length} tracks`;

  if (!State.songs.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <h3>Your Library is Empty</h3>
        <p>Import your own downloaded audio files (MP3, WAV, FLAC, M4A, OGG) to listen offline.</p>
        <div style="margin-top:16px;">
          <button class="btn-primary" onclick="showAddMusicMenu()">Add Music Files</button>
        </div>
      </div>`;
    return;
  }

  const q = ($('#search-input').value || '').toLowerCase().trim();
  const clearBtn = $('#search-clear-btn');
  if (clearBtn) clearBtn.style.display = q ? 'inline-block' : 'none';

  const sortMode = $('#sort-select').value;
  let songs = sortSongs(State.songs, sortMode);
  if (q) {
    songs = songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        (s.genre && s.genre.toLowerCase().includes(q))
    );
  }

  list.innerHTML =
    songs.map((s) => songRowHTML(s)).join('') ||
    `<div class="empty-state"><h3>No results matching "${escapeHtml(q)}"</h3></div>`;
  bindSongRows(list, songs.map((s) => s.id));
}

function songRowHTML(s, options = {}) {
  const art = s.art ? `style="background-image:url('${s.art}')"` : '';
  const liked = State.favorites.includes(s.id);
  const isPlaying = State.currentSong?.id === s.id;
  const isPlaylist = options.isPlaylist;
  const idx = options.index ?? 0;
  const total = options.total ?? 0;

  let extraActions = '';
  if (isPlaylist) {
    const canMoveUp = idx > 0;
    const canMoveDown = idx < total - 1;
    extraActions = `
      <div class="playlist-track-actions">
        ${canMoveUp ? `<button class="icon-btn" data-act="pl-moveup" title="Move Up in Playlist" aria-label="Move Up in Playlist"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 15l-6-6-6 6"/></svg></button>` : ''}
        ${canMoveDown ? `<button class="icon-btn" data-act="pl-movedown" title="Move Down in Playlist" aria-label="Move Down in Playlist"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></button>` : ''}
        <button class="icon-btn danger" data-act="pl-remove" title="Remove from Playlist" aria-label="Remove from Playlist"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
  }

  return `
    <div class="song-row ${isPlaying ? 'playing' : ''}" data-id="${s.id}" data-idx="${idx}">
      <div class="song-art" ${art}>
        ${isPlaying && State.isPlaying
          ? `<div class="now-playing-bars"><span></span><span></span><span></span></div>`
          : !s.art
          ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
          : ''}
      </div>
      <div class="song-meta">
        <div class="song-title">${escapeHtml(s.title)}</div>
        <div class="song-artist">
          <span class="link-artist" data-artist="${encodeURIComponent(s.artist)}">${escapeHtml(s.artist)}</span>
          <span class="dot-sep">·</span>
          <span class="link-album" data-album="${encodeURIComponent(s.album)}">${escapeHtml(s.album)}</span>
        </div>
      </div>
      <div class="song-duration">${fmtTime(s.duration)}</div>
      ${extraActions}
      <div class="song-actions">
        <button class="icon-btn ${liked ? 'like-active liked' : ''}" data-act="like" title="Toggle Favorite" aria-label="Toggle Favorite">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>
        </button>
        <button class="icon-btn" data-act="menu" title="More Options" aria-label="More Options">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </button>
      </div>
    </div>`;
}

function bindSongRows(container, idsInOrder, context = {}) {
  $$('.song-row', container).forEach((row) => {
    const id = row.dataset.id;
    const idx = parseInt(row.dataset.idx || '0', 10);
    row.onclick = (e) => {
      if (e.target.closest('[data-act]')) return;
      const aEl = e.target.closest('.link-artist');
      if (aEl) {
        e.stopPropagation();
        openArtistDetail(decodeURIComponent(aEl.dataset.artist));
        return;
      }
      const alEl = e.target.closest('.link-album');
      if (alEl) {
        e.stopPropagation();
        openAlbumDetail(decodeURIComponent(alEl.dataset.album));
        return;
      }
      playSong(id, idsInOrder);
    };
    const likeBtn = row.querySelector('[data-act="like"]');
    if (likeBtn) {
      likeBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(id);
      };
    }
    const moveUpBtn = row.querySelector('[data-act="pl-moveup"]');
    if (moveUpBtn && context.playlistId) {
      moveUpBtn.onclick = (e) => {
        e.stopPropagation();
        moveSongInPlaylist(context.playlistId, idx, -1);
      };
    }
    const moveDownBtn = row.querySelector('[data-act="pl-movedown"]');
    if (moveDownBtn && context.playlistId) {
      moveDownBtn.onclick = (e) => {
        e.stopPropagation();
        moveSongInPlaylist(context.playlistId, idx, 1);
      };
    }
    const removeBtn = row.querySelector('[data-act="pl-remove"]');
    if (removeBtn && context.playlistId) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeSongFromPlaylist(context.playlistId, id);
      };
    }
    const menuBtn = row.querySelector('[data-act="menu"]');
    if (menuBtn) {
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, songMenuItems(id, { ...context, index: idx }));
      };
    }
    row.oncontextmenu = (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, songMenuItems(id, { ...context, index: idx }));
    };
  });
}

function songMenuItems(id, context = {}) {
  const song = State.songs.find((s) => s.id === id);
  if (!song) return [];
  const liked = State.favorites.includes(id);
  const items = [
    { label: 'Play now', icon: '▶', onClick: () => playSong(id) },
    { label: 'Play next', icon: '⇧', onClick: () => playNext(id) },
    { label: 'Add to queue', icon: '＋', onClick: () => addToQueue(id) },
    { sep: true },
    {
      label: liked ? 'Remove from favorites' : 'Add to favorites',
      icon: '♥',
      onClick: () => toggleFavorite(id),
    },
    { label: 'Add to playlist…', icon: '≡', onClick: () => showAddToPlaylist(id) },
  ];

  if (context.isPlaylist && context.playlistId) {
    items.push(
      { sep: true },
      {
        label: 'Move up in playlist',
        icon: '↑',
        onClick: () => moveSongInPlaylist(context.playlistId, context.index, -1),
      },
      {
        label: 'Move down in playlist',
        icon: '↓',
        onClick: () => moveSongInPlaylist(context.playlistId, context.index, 1),
      },
      {
        label: 'Remove from playlist',
        danger: true,
        icon: '✕',
        onClick: () => removeSongFromPlaylist(context.playlistId, id),
      }
    );
  }

  items.push(
    { sep: true },
    { label: 'Edit song details…', icon: '✎', onClick: () => showEditMetadataModal(id) },
    { sep: true },
    { label: 'Delete from library', danger: true, icon: '✕', onClick: () => deleteSong(id) }
  );
  return items;
}

/* ----- Albums & Artists ----- */
function groupBy(arr, keyFn) {
  const map = new Map();
  arr.forEach((it) => {
    const k = keyFn(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  });
  return map;
}

function renderAlbums() {
  const grid = $('#albums-grid');
  const countSub = $('#albums-count-sub');
  if (!State.songs.length) {
    grid.innerHTML = emptyHTML('No albums found in your library');
    if (countSub) countSub.textContent = '0 albums';
    return;
  }
  const groups = [...groupBy(State.songs, (s) => s.album || 'Unknown Album').entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  if (countSub) countSub.textContent = `${groups.length} albums`;
  grid.innerHTML = groups.map(([album, songs]) => albumCardHTML(album, songs)).join('');
  attachCardClicks(grid, 'album');
}

function splitArtists(str) {
  if (!str) return ['Unknown Artist'];
  return [
    ...new Set(
      str
        .split(/\s*(?:,|;|&|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\bvs\.?|\bx\b)\s*/i)
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  ];
}

function renderArtists() {
  const grid = $('#artists-grid');
  const countSub = $('#artists-count-sub');
  if (!State.songs.length) {
    grid.innerHTML = emptyHTML('No artists found in your library');
    if (countSub) countSub.textContent = '0 artists';
    return;
  }
  const map = new Map();
  State.songs.forEach((song) => {
    splitArtists(song.artist).forEach((a) => {
      if (!map.has(a)) map.set(a, []);
      map.get(a).push(song);
    });
  });
  const groups = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (countSub) countSub.textContent = `${groups.length} artists`;
  grid.innerHTML = groups.map(([artist, songs]) => artistCardHTML(artist, songs)).join('');
  attachCardClicks(grid, 'artist');
}

function renderPlaylists() {
  const grid = $('#playlists-grid');
  const countSub = $('#playlists-count-sub');
  if (countSub) countSub.textContent = `${State.playlists.length} playlists`;
  if (!State.playlists.length) {
    grid.innerHTML = emptyHTML('No playlists yet. Tap "New Playlist" to create one.');
    return;
  }
  grid.innerHTML = State.playlists.map((p) => playlistCardHTML(p)).join('');
  attachCardClicks(grid, 'playlist');
}

function renderFavorites() {
  const list = $('#favorites-list');
  const countSub = $('#favorites-count-sub');
  const favActions = $('#fav-actions');
  const favs = State.favorites.map((id) => State.songs.find((s) => s.id === id)).filter(Boolean);
  if (countSub) countSub.textContent = `${favs.length} favorite songs`;

  if (!favs.length) {
    list.innerHTML = emptyHTML('No favorites yet — tap the heart icon on any song');
    if (favActions) favActions.style.display = 'none';
    return;
  }
  if (favActions) favActions.style.display = 'flex';
  list.innerHTML = favs.map((s) => songRowHTML(s)).join('');
  bindSongRows(list, favs.map((s) => s.id));

  $('#fav-play-all').onclick = () => {
    if (favs.length) playSong(favs[0].id, favs.map((s) => s.id));
  };
  $('#fav-shuffle-all').onclick = () => {
    const ids = favs.map((s) => s.id);
    if (!ids.length) return;
    const shuffled = fisherYatesShuffle(ids);
    State.originalQueue = [...ids];
    State.shuffle = true;
    $('#shuffle-btn')?.classList.add('active');
    playSong(shuffled[0], shuffled);
  };
}

function emptyHTML(msg) {
  return `<div class="empty-state"><h3>${msg}</h3></div>`;
}

/* ----- Detail Views (Album / Artist / Playlist) ----- */
let currentDetail = null;

function openAlbumDetail(album) {
  const songs = State.songs.filter((s) => s.album === album);
  showDetail({
    kind: 'Album',
    title: album,
    sub: `${songs.length} song${songs.length !== 1 ? 's' : ''} · ${[...new Set(songs.map((s) => s.artist))].join(', ')}`,
    art: songs.find((s) => s.art)?.art,
    songs,
  });
}

function openArtistDetail(artist) {
  const target = artist.toLowerCase().trim();
  const songs = State.songs.filter((s) => splitArtists(s.artist).some((a) => a.toLowerCase().trim() === target));
  const albums = new Set(songs.map((s) => s.album));
  showDetail({
    kind: 'Artist',
    title: artist,
    sub: `${songs.length} song${songs.length !== 1 ? 's' : ''} · ${albums.size} album${albums.size !== 1 ? 's' : ''}`,
    art: songs.find((s) => s.art)?.art,
    songs,
    roundArt: true,
  });
}

function openPlaylistDetail(id) {
  const pl = State.playlists.find((p) => p.id === id);
  if (!pl) return;
  const songs = pl.songIds.map((sid) => State.songs.find((s) => s.id === sid)).filter(Boolean);
  showDetail({
    kind: 'Playlist',
    title: pl.name,
    sub: `${songs.length} song${songs.length !== 1 ? 's' : ''}`,
    art: songs.find((s) => s.art)?.art,
    songs,
    isPlaylist: true,
    playlistId: id,
  });
}

function showDetail(d) {
  currentDetail = d;
  $('#detail-kind').textContent = d.kind;
  $('#detail-title').textContent = d.title;
  $('#detail-sub').textContent = d.sub;
  const artEl = $('#detail-art');
  artEl.style.backgroundImage = d.art ? `url('${d.art}')` : '';
  artEl.style.borderRadius = d.roundArt ? '50%' : '20px';

  if (d.isPlaylist) {
    $('#detail-songs').innerHTML =
      d.songs
        .map((s, idx) =>
          songRowHTML(s, {
            isPlaylist: true,
            playlistId: d.playlistId,
            index: idx,
            total: d.songs.length,
          })
        )
        .join('') || emptyHTML('Playlist is empty');
    bindSongRows($('#detail-songs'), d.songs.map((s) => s.id), {
      isPlaylist: true,
      playlistId: d.playlistId,
    });
  } else {
    $('#detail-songs').innerHTML =
      d.songs.map((s) => songRowHTML(s)).join('') || emptyHTML('No tracks found');
    bindSongRows($('#detail-songs'), d.songs.map((s) => s.id));
  }

  $('#detail-rename').style.display = d.isPlaylist ? '' : 'none';
  $('#detail-delete').style.display = d.isPlaylist ? '' : 'none';

  $('#detail-play').onclick = () => {
    if (d.songs.length) playSong(d.songs[0].id, d.songs.map((s) => s.id));
  };
  $('#detail-shuffle').onclick = () => {
    if (!d.songs.length) return;
    const ids = d.songs.map((s) => s.id);
    const shuffled = fisherYatesShuffle(ids);
    State.originalQueue = [...ids];
    State.shuffle = true;
    $('#shuffle-btn')?.classList.add('active');
    playSong(shuffled[0], shuffled);
  };
  $('#detail-rename').onclick = () => renamePlaylist(d.playlistId);
  $('#detail-delete').onclick = () => deletePlaylist(d.playlistId);

  showView('detail');
}

/* ----- Statistics View ----- */
function renderStatistics() {
  $('#stat-total-tracks').textContent = State.songs.length;

  const artists = new Set();
  State.songs.forEach((s) => splitArtists(s.artist).forEach((a) => artists.add(a)));
  $('#stat-total-artists').textContent = artists.size;

  const albums = new Set(State.songs.map((s) => s.album || 'Unknown'));
  $('#stat-total-albums').textContent = albums.size;

  $('#stat-total-listening-time').textContent = fmtDurationLong(State.settings.totalPlaySeconds || 0);

  // Top Most Played
  const topTracks = [...State.songs].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 5);
  const topList = $('#stat-top-tracks');
  if (topTracks.length && topTracks[0].playCount > 0) {
    topList.innerHTML = topTracks
      .map(
        (s, i) => `
        <div class="ranked-item" onclick="playSong('${s.id}')" style="cursor:pointer;" title="Click to play">
          <span class="rank-badge">${i + 1}</span>
          <span class="ranked-name"><strong>${escapeHtml(s.title)}</strong> · ${escapeHtml(s.artist)}</span>
          <span class="ranked-count">${s.playCount || 0} plays</span>
        </div>`
      )
      .join('');
  } else {
    topList.innerHTML = `<div class="empty-mini">Play more songs to see your rankings</div>`;
  }

  // Top Artists
  const artistCounts = new Map();
  State.songs.forEach((s) => {
    splitArtists(s.artist).forEach((a) => {
      artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
    });
  });
  const topArtists = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const artistList = $('#stat-top-artists');
  if (topArtists.length) {
    artistList.innerHTML = topArtists
      .map(
        ([a, cnt], i) => `
        <div class="ranked-item" onclick="openArtistDetail('${encodeURIComponent(a)}')" style="cursor:pointer;">
          <span class="rank-badge">${i + 1}</span>
          <span class="ranked-name">${escapeHtml(a)}</span>
          <span class="ranked-count">${cnt} track${cnt !== 1 ? 's' : ''}</span>
        </div>`
      )
      .join('');
  } else {
    artistList.innerHTML = `<div class="empty-mini">No artists recorded yet</div>`;
  }

  // Genres Breakdown
  const genreCounts = new Map();
  State.songs.forEach((s) => {
    const g = s.genre || 'Local Audio';
    genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
  });
  const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const genreList = $('#stat-genres-list');
  if (topGenres.length) {
    genreList.innerHTML = topGenres
      .map(
        ([g, cnt]) => `
        <div class="ranked-item">
          <span class="ranked-name">${escapeHtml(g)}</span>
          <span class="ranked-count">${cnt} track${cnt !== 1 ? 's' : ''}</span>
        </div>`
      )
      .join('');
  } else {
    genreList.innerHTML = `<div class="empty-mini">No genre metadata extracted yet</div>`;
  }

  updateStorageMetrics();
}

async function updateStorageMetrics() {
  $('#storage-track-count').textContent = State.songs.length;
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const usageMb = (usage / (1024 * 1024)).toFixed(1);
      const quotaGb = (quota / (1024 * 1024 * 1024)).toFixed(1);
      const pct = Math.min(100, Math.max(1, (usage / quota) * 100));

      const bar = $('#stats-storage-bar');
      if (bar) bar.style.width = pct.toFixed(1) + '%';
      const label = $('#stats-storage-used');
      if (label) label.textContent = `${usageMb} MB used of ~${quotaGb} GB`;
      const usageStr = $('#storage-usage-str');
      if (usageStr) usageStr.textContent = `${usageMb} MB (${pct.toFixed(2)}% of available storage)`;
    } catch (e) {}
  }
  if ('storage' in navigator && 'persisted' in navigator.storage) {
    const isPersisted = await navigator.storage.persisted();
    const badge = $('#storage-persistence-badge');
    const statStatus = $('#stats-storage-status');
    if (badge) badge.textContent = isPersisted ? '✓ Granted (Persistent)' : 'Default (Best Effort)';
    if (statStatus) statStatus.textContent = isPersisted ? 'Persistent' : 'Best effort';
  }
}

/* ============== METADATA EDITOR MODAL ============== */
function showEditMetadataModal(id) {
  const song = State.songs.find((s) => s.id === id);
  if (!song) return;

  $('#meta-edit-id').value = song.id;
  $('#meta-edit-title').value = song.title || '';
  $('#meta-edit-artist').value = song.artist || '';
  $('#meta-edit-album').value = song.album || '';
  $('#meta-edit-genre').value = song.genre || '';
  $('#meta-edit-year').value = song.year || '';

  const modal = $('#meta-editor-modal');
  modal.classList.add('open');

  $('#meta-edit-cancel').onclick = () => modal.classList.remove('open');
  $('#meta-form').onsubmit = async () => {
    song.title = $('#meta-edit-title').value.trim() || song.title;
    song.artist = $('#meta-edit-artist').value.trim() || 'Unknown Artist';
    song.album = $('#meta-edit-album').value.trim() || 'Unknown Album';
    song.genre = $('#meta-edit-genre').value.trim() || 'Local Audio';
    song.year = $('#meta-edit-year').value.trim() || '';

    await idbPut('meta', song);
    persistState();
    renderAll();
    if (State.currentSong?.id === song.id) {
      updateMini();
      updateFullPlayer();
      updateMediaSession(song);
    }
    modal.classList.remove('open');
    toast('Song information updated');
  };
}

/* ============== NAVIGATION & ROUTING ============== */
function showView(view) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  $$('.bottom-nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));

  $('#main').scrollTo({ top: 0, behavior: 'smooth' });
  $('#sidebar').classList.remove('open');
  $('.sidebar-backdrop')?.classList.remove('show');

  if (view === 'stats') renderStatistics();
}

/* ============== PLAYBACK ENGINE ============== */
async function playSong(id, queueIds, isShuffleIntent = false) {
  ensureAudioGraph();
  if (audioCtx?.state === 'suspended') audioCtx.resume();

  const song = State.songs.find((s) => s.id === id);
  if (!song) return;

  if (queueIds && queueIds.length) {
    State.originalQueue = [...queueIds];
  } else if (!State.originalQueue.includes(id)) {
    State.originalQueue = State.songs.map((s) => s.id);
  }

  if (isShuffleIntent) {
    State.shuffle = true;
    $('#shuffle-btn')?.classList.add('active');
  }

  if (State.shuffle) {
    const remaining = State.originalQueue.filter((x) => x !== id);
    State.queue = [id, ...fisherYatesShuffle(remaining)];
    State.queueIndex = 0;
  } else {
    State.queue = [...State.originalQueue];
    State.queueIndex = State.queue.indexOf(id);
    if (State.queueIndex === -1) {
      State.queue.push(id);
      State.queueIndex = State.queue.length - 1;
    }
  }

  const url = await getBlobUrl(song);
  if (!url) {
    toast('Audio data unavailable on device');
    return;
  }

  audio.src = url;
  audio.playbackRate = State.settings.speed;
  audio.volume = State.settings.volume;

  try {
    await audio.play();
  } catch (e) {
    console.warn('Playback error or autoplay blocked', e);
  }

  State.currentSong = song;
  song.playCount = (song.playCount || 0) + 1;
  song.lastPlayed = Date.now();
  idbPut('meta', song);

  State.recent = [id, ...State.recent.filter((x) => x !== id)].slice(0, 30);
  persistState();

  renderSongs();
  renderFavorites();
  renderHome();
  updateMini();
  updateFullPlayer();
  renderQueue();
  updateMediaSession(song);
  loadLyricsForSong(song.id);

  if (song.art) extractColorsFromImage(song.art).then(applyAccentFromColors);
  document.title = `${song.title} — ${song.artist} · Harxora Vibez`;
}

function togglePlay() {
  if (!State.currentSong) {
    if (State.songs.length) playSong(State.songs[0].id);
    return;
  }
  if (audio.paused) {
    ensureAudioGraph();
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    audio.play();
  } else {
    audio.pause();
  }
}

function nextTrack(auto = false) {
  if (!State.queue.length) return;
  if (State.repeat === 'one' && auto) {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  const nextIdx = State.queueIndex + 1;
  if (nextIdx < State.queue.length) {
    playQueueIndex(nextIdx);
  } else {
    if (State.repeat === 'all') {
      if (State.shuffle && State.originalQueue.length > 1) {
        State.queue = fisherYatesShuffle(State.originalQueue);
        playQueueIndex(0);
      } else {
        playQueueIndex(0);
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
      State.isPlaying = false;
      updatePlayButtons();
    }
  }
}

function prevTrack() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  let prevIdx = State.queueIndex - 1;
  if (prevIdx < 0) {
    prevIdx = State.repeat === 'all' ? State.queue.length - 1 : 0;
  }
  if (prevIdx >= 0 && prevIdx < State.queue.length) {
    playQueueIndex(prevIdx);
  }
}

function toggleShuffle() {
  State.shuffle = !State.shuffle;
  $('#shuffle-btn')?.classList.toggle('active', State.shuffle);

  if (State.shuffle) {
    if (State.queue.length <= 1) {
      if (!State.originalQueue.length && State.queue.length === 1) {
        State.originalQueue = [...State.queue];
      }
      toast('Shuffle enabled');
      return;
    }
    if (!State.originalQueue.length) {
      State.originalQueue = [...State.queue];
    }
    // Keep already played tracks and currently playing track in place, shuffle upcoming tracks
    const played = State.queue.slice(0, State.queueIndex + 1);
    const unplayed = State.queue.slice(State.queueIndex + 1);
    State.queue = [...played, ...fisherYatesShuffle(unplayed)];
    renderQueue();
    toast('Shuffle enabled');
  } else {
    // When turning shuffle off, restore original queue order and keep current song playing
    if (State.originalQueue.length) {
      const currentId = State.currentSong?.id;
      State.queue = [...State.originalQueue];
      State.queueIndex = currentId ? State.queue.indexOf(currentId) : 0;
      if (State.queueIndex === -1) State.queueIndex = 0;
      renderQueue();
    }
    toast('Shuffle disabled');
  }
}

function toggleRepeat() {
  State.repeat = State.repeat === 'off' ? 'all' : State.repeat === 'all' ? 'one' : 'off';
  const btn = $('#repeat-btn');
  btn.classList.toggle('active', State.repeat !== 'off');
  btn.classList.toggle('repeat-one', State.repeat === 'one');
  btn.title = `Repeat: ${State.repeat}`;
  toast(`Repeat: ${State.repeat}`);
}

function addToQueue(id) {
  if (!State.queue.includes(id)) State.queue.push(id);
  if (!State.originalQueue.includes(id)) State.originalQueue.push(id);
  renderQueue();
  toast('Added to queue');
}

function playNext(id) {
  State.queue = State.queue.filter((x) => x !== id);
  State.queue.splice(State.queueIndex + 1, 0, id);
  if (!State.originalQueue.includes(id)) State.originalQueue.push(id);
  renderQueue();
  toast('Will play next');
}

/* Audio Element Event Listeners */
audio.addEventListener('play', () => {
  State.isPlaying = true;
  updatePlayButtons();
  $('#art-frame')?.classList.toggle('spin', State.settings.rotateArt);
  $('#art-disc')?.classList.toggle('spin', State.settings.rotateArt);
  startVisualizer();
  renderQueue();
  updateMediaSessionPosition();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'playing';
  }
});

audio.addEventListener('pause', () => {
  State.isPlaying = false;
  updatePlayButtons();
  $('#art-frame')?.classList.remove('spin');
  $('#art-disc')?.classList.remove('spin');
  stopVisualizer();
  renderQueue();
  updateMediaSessionPosition();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'paused';
  }
});

audio.addEventListener('ended', () => {
  if (State.settings.autoplay) nextTrack(true);
});

let lastSecRecorded = 0;
audio.addEventListener('timeupdate', () => {
  updateProgress();
  updateLyricsHighlight(audio.currentTime);

  // Track listening stats in seconds
  const currentSec = Math.floor(audio.currentTime);
  if (currentSec !== lastSecRecorded && State.isPlaying) {
    lastSecRecorded = currentSec;
    State.settings.totalPlaySeconds = (State.settings.totalPlaySeconds || 0) + 1;
    if (State.settings.totalPlaySeconds % 30 === 0) persistState();
  }
  updateMediaSessionPosition();
});

audio.addEventListener('loadedmetadata', () => {
  $('#time-total').textContent = fmtTime(audio.duration);
  if (State.currentSong && !State.currentSong.duration) {
    State.currentSong.duration = audio.duration;
    idbPut('meta', State.currentSong);
  }
  updateMediaSessionPosition();
});

function updatePlayButtons() {
  const playing = State.isPlaying;
  const playIcon = playing
    ? '<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  $('#play-btn').innerHTML = playIcon;
  $('#mini-play').innerHTML = playing
    ? '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}

function updateProgress() {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  const seek = $('#seek');
  if (seek) {
    seek.value = pct * 10;
    seek.style.setProperty('--seek-pct', pct + '%');
  }
  const curTime = $('#time-current');
  if (curTime) curTime.textContent = fmtTime(audio.currentTime);
  const miniFill = $('#mini-progress-fill');
  if (miniFill) miniFill.style.width = pct + '%';
  const miniTime = $('#mini-time');
  if (miniTime) miniTime.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`;
  const miniProgress = $('#mini-progress');
  if (miniProgress) {
    miniProgress.setAttribute('aria-valuenow', Math.round(pct));
  }
}

function updateMini() {
  const mini = $('#mini-player');
  if (!State.currentSong) {
    mini.classList.remove('visible');
    document.body.classList.remove('has-mini-player');
    $('#mini-title').textContent = '';
    $('#mini-artist').textContent = '';
    $('#mini-time').textContent = '';
    const miniFill = $('#mini-progress-fill');
    if (miniFill) miniFill.style.width = '0%';
    return;
  }
  mini.classList.add('visible');
  document.body.classList.add('has-mini-player');
  $('#mini-title').textContent = State.currentSong.title || 'Unknown Title';
  $('#mini-artist').textContent = State.currentSong.artist || 'Unknown Artist';
  $('#mini-like')?.classList.toggle('like-active', State.favorites.includes(State.currentSong.id));
  const miniArt = $('#mini-art');
  if (State.currentSong.art) {
    miniArt.style.backgroundImage = `url('${State.currentSong.art}')`;
    miniArt.innerHTML = '';
  } else {
    miniArt.style.backgroundImage = '';
    miniArt.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  }
}

function updateFullPlayer() {
  if (!State.currentSong) return;
  $('#full-title').textContent = State.currentSong.title || 'Unknown Title';
  $('#full-artist').textContent = `${State.currentSong.artist || 'Unknown Artist'} · ${State.currentSong.album || 'Unknown Album'}`;
  
  const fullArtImg = $('#full-art-img');
  const fallback = $('#art-fallback');
  const ambientGlow = $('#art-ambient-glow');
  const fullBg = $('#full-bg');
  
  if (State.currentSong.art) {
    if (fullArtImg) {
      fullArtImg.src = State.currentSong.art;
      fullArtImg.style.display = 'block';
    }
    if (fallback) fallback.style.display = 'none';
    if (ambientGlow) ambientGlow.style.backgroundImage = `url('${State.currentSong.art}')`;
    if (fullBg) fullBg.style.backgroundImage = `url('${State.currentSong.art}')`;
    $('#art-inner').style.backgroundImage = `url('${State.currentSong.art}')`;
  } else {
    if (fullArtImg) {
      fullArtImg.src = '';
      fullArtImg.style.display = 'none';
    }
    if (fallback) fallback.style.display = 'grid';
    if (ambientGlow) ambientGlow.style.backgroundImage = 'none';
    if (fullBg) fullBg.style.backgroundImage = 'none';
    $('#art-inner').style.backgroundImage = '';
  }

  $('#art-frame')?.classList.toggle('spin', State.settings.rotateArt && State.isPlaying);
  $('#art-disc')?.classList.toggle('spin', State.settings.rotateArt && State.isPlaying);
  $('#like-btn').classList.toggle('like-active', State.favorites.includes(State.currentSong.id));

  if (State.settings.playerStyle === 'dynamic') {
    applyDynamicArtworkStyle(State.currentSong);
  }
}

/* ============== QUEUE MANAGEMENT ============== */
function renderQueue() {
  const ql = $('#queue-list');
  const countEl = $('#queue-total-count');
  if (countEl) countEl.textContent = `${State.queue.length} track${State.queue.length !== 1 ? 's' : ''}`;

  const totalSecs = State.queue.reduce((acc, qid) => {
    const s = State.songs.find((x) => x.id === qid);
    return acc + (s?.duration || 0);
  }, 0);
  const durEl = $('#queue-total-duration');
  if (durEl) durEl.textContent = totalSecs > 0 ? fmtDurationLong(totalSecs) : '0:00';

  if (!State.queue.length) {
    ql.innerHTML = `
      <div class="empty-state" style="padding: 48px 16px;">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity:0.35; margin-bottom:12px;">
          <path d="M4 6h16M4 12h10M4 18h10M18 14v7M15 17l3-3 3 3"/>
        </svg>
        <h3 style="font-size:1.1rem; margin-bottom:6px;">Your queue is empty</h3>
        <p style="font-size:0.84rem; color:var(--text-faint);">Play a song, album, or playlist to fill your queue.</p>
      </div>`;
    return;
  }

  const sections = [];
  // Currently playing track
  if (State.queueIndex >= 0 && State.queueIndex < State.queue.length) {
    const s = State.songs.find((x) => x.id === State.queue[State.queueIndex]);
    if (s) {
      sections.push(`<div class="queue-section-title">Now Playing</div>`);
      sections.push(queueRowHTML(s, State.queueIndex, true));
    }
  }

  // Up Next
  const upNext = State.queue.slice(State.queueIndex + 1);
  if (upNext.length) {
    sections.push(
      `<div class="queue-section-title">Up Next <span class="queue-count">${upNext.length}</span></div>`
    );
    upNext.forEach((id, i) => {
      const s = State.songs.find((x) => x.id === id);
      if (s) sections.push(queueRowHTML(s, State.queueIndex + 1 + i, false));
    });
  }

  // Played history in current session
  const history = State.queue.slice(0, Math.max(0, State.queueIndex));
  if (history.length) {
    sections.push(`<div class="queue-section-title queue-history-title">Played</div>`);
    history.forEach((id, i) => {
      const s = State.songs.find((x) => x.id === id);
      if (s) sections.push(queueRowHTML(s, i, false, true));
    });
  }

  ql.innerHTML = sections.join('');

  $$('.song-row', ql).forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('[data-act]')) return;
      const qi = parseInt(row.dataset.qi, 10);
      if (qi === State.queueIndex) {
        togglePlay();
        return;
      }
      playQueueIndex(qi);
    };
    const rm = row.querySelector('[data-act="rmq"]');
    if (rm) {
      rm.onclick = (e) => {
        e.stopPropagation();
        removeFromQueue(parseInt(row.dataset.qi, 10));
      };
    }
    const moveUp = row.querySelector('[data-act="moveup"]');
    if (moveUp) {
      moveUp.onclick = (e) => {
        e.stopPropagation();
        moveQueueItem(parseInt(row.dataset.qi, 10), -1);
      };
    }
    const moveDown = row.querySelector('[data-act="movedown"]');
    if (moveDown) {
      moveDown.onclick = (e) => {
        e.stopPropagation();
        moveQueueItem(parseInt(row.dataset.qi, 10), 1);
      };
    }
  });

  const current = ql.querySelector('.song-row.playing');
  if (current) {
    requestAnimationFrame(() => current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
}

function queueRowHTML(s, qi, isCurrent, isHistory = false) {
  const art = s.art ? `style="background-image:url('${s.art}')"` : '';
  const canMoveUp = qi > State.queueIndex + 1;
  const canMoveDown = qi >= State.queueIndex + 1 && qi < State.queue.length - 1;

  return `
    <div class="song-row ${isCurrent ? 'playing' : ''} ${isHistory ? 'queue-history' : ''}" data-id="${s.id}" data-qi="${qi}">
      <div class="song-art" ${art}>
        ${isCurrent
          ? `<div class="now-playing-bars"><span></span><span></span><span></span></div>`
          : !s.art
          ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
          : ''}
      </div>
      <div class="song-meta">
        <div class="song-title">${escapeHtml(s.title)}</div>
        <div class="song-artist">${escapeHtml(s.artist)}</div>
      </div>
      <div class="queue-row-btns">
        ${canMoveUp ? `<button class="icon-btn" data-act="moveup" title="Move Up"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg></button>` : ''}
        ${canMoveDown ? `<button class="icon-btn" data-act="movedown" title="Move Down"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>` : ''}
        <button class="icon-btn" data-act="rmq" title="Remove from queue">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    </div>`;
}

async function playQueueIndex(qi) {
  if (qi < 0 || qi >= State.queue.length) return;
  const id = State.queue[qi];
  const song = State.songs.find((s) => s.id === id);
  if (!song) return;

  ensureAudioGraph();
  if (audioCtx?.state === 'suspended') audioCtx.resume();

  const url = await getBlobUrl(song);
  if (!url) {
    toast('Audio file missing');
    return;
  }

  audio.src = url;
  audio.playbackRate = State.settings.speed;
  audio.volume = State.settings.volume;
  State.queueIndex = qi;

  try {
    await audio.play();
  } catch (e) {
    console.warn('Play failed', e);
  }

  State.currentSong = song;
  song.playCount = (song.playCount || 0) + 1;
  song.lastPlayed = Date.now();
  idbPut('meta', song);

  State.recent = [id, ...State.recent.filter((x) => x !== id)].slice(0, 30);
  persistState();

  renderSongs();
  renderFavorites();
  renderHome();
  updateMini();
  updateFullPlayer();
  renderQueue();
  updateMediaSession(song);
  loadLyricsForSong(song.id);

  if (song.art) extractColorsFromImage(song.art).then(applyAccentFromColors);
  document.title = `${song.title} — ${song.artist} · Harxora Vibez`;
}

function removeFromQueue(qi) {
  if (qi < 0 || qi >= State.queue.length) return;
  const removedId = State.queue[qi];
  const isCurrent = qi === State.queueIndex;

  State.queue.splice(qi, 1);
  State.originalQueue = State.originalQueue.filter((x) => x !== removedId);

  if (qi < State.queueIndex) {
    State.queueIndex--;
  } else if (isCurrent) {
    if (State.queueIndex < State.queue.length) {
      playQueueIndex(State.queueIndex);
    } else if (State.queue.length) {
      playQueueIndex(0);
    } else {
      audio.pause();
      audio.src = '';
      State.currentSong = null;
      State.queueIndex = -1;
      updateMini();
      updatePlayButtons();
    }
  }
  renderQueue();
}

function moveQueueItem(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex <= State.queueIndex || targetIndex >= State.queue.length) return;
  const item = State.queue.splice(index, 1)[0];
  State.queue.splice(targetIndex, 0, item);
  renderQueue();
}

function clearQueue() {
  if (!State.queue.length) return;
  showConfirm(
    'Clear Queue?',
    'Do you want to clear upcoming tracks from the queue? The currently playing track will continue playing.',
    () => {
      if (!State.currentSong) {
        State.queue = [];
        State.originalQueue = [];
        State.queueIndex = -1;
      } else {
        State.queue = [State.currentSong.id];
        State.originalQueue = [State.currentSong.id];
        State.queueIndex = 0;
      }
      renderQueue();
      toast('Queue cleared');
    }
  );
}

/* ============== FAVORITES, PLAYLISTS & DELETE ============== */
function toggleFavorite(id) {
  if (State.favorites.includes(id)) {
    State.favorites = State.favorites.filter((x) => x !== id);
    idbDel('favorites', id);
  } else {
    State.favorites.push(id);
    idbPut('favorites', { id });
  }
  persistState();
  renderSongs();
  renderFavorites();
  renderHome();
  if (State.currentSong?.id === id) updateFullPlayer();
}

function newPlaylist() {
  showPrompt('New Playlist', 'Playlist name', '', (name) => {
    const trimmed = name?.trim();
    if (!trimmed) {
      toast('Playlist name cannot be empty');
      return;
    }
    if (State.playlists.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast('A playlist with this name already exists');
      return;
    }
    const pl = { id: uid(), name: trimmed, songIds: [] };
    State.playlists.push(pl);
    idbPut('playlists', pl);
    persistState();
    renderPlaylists();
    renderHome();
    toast(`Playlist "${trimmed}" created`);
  });
}

function renamePlaylist(id) {
  const pl = State.playlists.find((p) => p.id === id);
  if (!pl) return;
  showPrompt('Rename Playlist', 'New name', pl.name, (name) => {
    const trimmed = name?.trim();
    if (!trimmed) {
      toast('Playlist name cannot be empty');
      return;
    }
    if (
      trimmed.toLowerCase() !== pl.name.toLowerCase() &&
      State.playlists.some((p) => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      toast('A playlist with this name already exists');
      return;
    }
    pl.name = trimmed;
    idbPut('playlists', pl);
    persistState();
    renderPlaylists();
    renderHome();
    if (currentDetail?.playlistId === id) openPlaylistDetail(id);
    toast('Playlist renamed');
  });
}

function removeSongFromPlaylist(playlistId, songId) {
  const pl = State.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const s = State.songs.find((x) => x.id === songId);
  pl.songIds = pl.songIds.filter((x) => x !== songId);
  idbPut('playlists', pl);
  persistState();
  renderPlaylists();
  renderHome();
  if (currentDetail?.playlistId === playlistId) openPlaylistDetail(playlistId);
  toast(`Removed "${s?.title || 'track'}" from playlist`);
}

function moveSongInPlaylist(playlistId, index, direction) {
  const pl = State.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= pl.songIds.length) return;
  const item = pl.songIds.splice(index, 1)[0];
  pl.songIds.splice(targetIndex, 0, item);
  idbPut('playlists', pl);
  persistState();
  renderPlaylists();
  renderHome();
  if (currentDetail?.playlistId === playlistId) openPlaylistDetail(playlistId);
}

function deletePlaylist(id) {
  showConfirm('Delete Playlist?', 'This will not delete the audio files from your library.', async () => {
    State.playlists = State.playlists.filter((p) => p.id !== id);
    await idbDel('playlists', id);
    persistState();
    renderPlaylists();
    renderHome();
    showView('playlists');
    toast('Playlist deleted');
  });
}

function showAddToPlaylist(songId) {
  const body = `
    <p class="muted" style="margin-bottom:10px">Choose a playlist or create new</p>
    <div class="pl-list">
      ${State.playlists
        .map(
          (p) => `
        <div class="pl-item" data-id="${p.id}">
          <span>${escapeHtml(p.name)}</span>
          <span class="muted">${p.songIds.length}</span>
        </div>`
        )
        .join('') || '<div class="muted">No playlists yet.</div>'}
    </div>
    <button class="btn-ghost" id="new-pl-inline" style="margin-top:10px; width:100%">+ New playlist</button>`;
  openModal('Add to Playlist', body, null, true);

  $$('.pl-item').forEach((it) => {
    it.onclick = () => {
      const pl = State.playlists.find((p) => p.id === it.dataset.id);
      if (pl) {
        if (!pl.songIds.includes(songId)) {
          pl.songIds.push(songId);
          idbPut('playlists', pl);
          persistState();
          renderPlaylists();
          renderHome();
          toast(`Added to "${pl.name}"`);
        } else {
          toast(`Already in "${pl.name}"`);
        }
      }
      closeModal();
    };
  });

  $('#new-pl-inline').onclick = () => {
    closeModal();
    showPrompt('New Playlist', 'Playlist name', '', (name) => {
      if (!name?.trim()) return;
      const pl = { id: uid(), name: name.trim(), songIds: [songId] };
      State.playlists.push(pl);
      idbPut('playlists', pl);
      persistState();
      renderPlaylists();
      renderHome();
      toast(`Created "${pl.name}"`);
    });
  };
}

async function deleteSong(id) {
  showConfirm('Delete from library?', 'This audio file will be removed from your device.', async () => {
    await idbDel('files', id);
    await idbDel('meta', id);
    await idbDel('lyrics', id);
    await idbDel('favorites', id);

    State.songs = State.songs.filter((s) => s.id !== id);
    State.favorites = State.favorites.filter((x) => x !== id);
    State.recent = State.recent.filter((x) => x !== id);
    State.playlists.forEach((p) => (p.songIds = p.songIds.filter((x) => x !== id)));
    State.queue = State.queue.filter((x) => x !== id);

    if (State.currentSong?.id === id) {
      audio.pause();
      audio.src = '';
      State.currentSong = null;
      updateMini();
    }
    if (State.blobUrls.has(id)) {
      URL.revokeObjectURL(State.blobUrls.get(id));
      State.blobUrls.delete(id);
    }
    persistState();
    renderAll();
    toast('Song deleted');
  });
}

/* ============== BACKUP & RESTORE ============== */
async function exportBackupJSON() {
  try {
    const allLyrics = await idbAll('lyrics');
    const backupData = {
      app: 'Harxora Vibez',
      version: 2,
      exportedAt: new Date().toISOString(),
      songsMeta: State.songs.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        genre: s.genre,
        year: s.year,
        trackNo: s.trackNo,
        duration: s.duration,
        addedAt: s.addedAt,
        fileName: s.fileName,
        size: s.size,
        playCount: s.playCount,
      })),
      playlists: State.playlists,
      favorites: State.favorites,
      recent: State.recent,
      lyrics: allLyrics,
      settings: State.settings,
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `harxora-vibez-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exported successfully');
  } catch (err) {
    toast('Backup export failed');
    console.error(err);
  }
}

async function restoreBackupJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.playlists && !data.songsMeta && !data.favorites) {
      toast('Invalid Harxora Vibez backup file');
      return;
    }

    const songCount = data.songsMeta?.length || 0;
    const plCount = data.playlists?.length || 0;
    const favCount = data.favorites?.length || 0;

    showConfirm(
      'Restore Backup?',
      `Found ${songCount} track records, ${plCount} playlists, and ${favCount} favorites. Merge into your library?`,
      async () => {
        if (data.playlists?.length) {
          data.playlists.forEach((p) => {
            if (!State.playlists.some((ex) => ex.id === p.id)) {
              State.playlists.push(p);
              idbPut('playlists', p);
            }
          });
        }
        if (data.favorites?.length) {
          data.favorites.forEach((favId) => {
            if (!State.favorites.includes(favId)) {
              State.favorites.push(favId);
              idbPut('favorites', { id: favId });
            }
          });
        }
        if (data.lyrics?.length) {
          for (const lyr of data.lyrics) {
            await idbPut('lyrics', lyr);
          }
        }
        if (data.settings) {
          State.settings = { ...State.settings, ...data.settings };
          applyTheme(State.settings.theme);
          applyAccent(State.settings.accent);
        }
        persistState();
        renderAll();
        toast('Backup restored successfully!');
      }
    );
  } catch (err) {
    toast('Failed to parse backup file');
    console.error(err);
  }
}

/* ============== THEMES & PERSONALIZATION ============== */
const VALID_PLAYER_STYLES = ['glass', 'immersive', 'minimal', 'transparent', 'dynamic', 'classic'];

function applyTheme(name) {
  State.settings.theme = name;
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-amoled', 'theme-custom');
  document.body.classList.add(`theme-${name}`);
  $$('.theme-pick').forEach((b) => b.classList.toggle('active', b.dataset.theme === name));
  persistState();
}

function applyPlayerStyle(style) {
  if (!VALID_PLAYER_STYLES.includes(style)) style = 'glass';
  State.settings.playerStyle = style;

  VALID_PLAYER_STYLES.forEach((s) => {
    document.body.classList.remove(`player-style-${s}`);
  });
  document.body.classList.add(`player-style-${style}`);

  $$('#player-style-grid .player-style-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.style === style);
  });

  if (style === 'dynamic' && State.currentSong) {
    applyDynamicArtworkStyle(State.currentSong);
  } else if (style !== 'dynamic') {
    document.documentElement.style.removeProperty('--player-dyn-bg1');
    document.documentElement.style.removeProperty('--player-dyn-bg2');
    document.documentElement.style.removeProperty('--player-dyn-accent');
  }

  persistState();
}

async function applyDynamicArtworkStyle(song) {
  if (!song || !song.art) {
    document.documentElement.style.setProperty('--player-dyn-bg1', '#1e1635');
    document.documentElement.style.setProperty('--player-dyn-bg2', '#07070d');
    return;
  }

  let colors = State.colorCache.get(song.id);
  if (!colors) {
    colors = await extractColorsFromImage(song.art);
    if (colors && colors.length) State.colorCache.set(song.id, colors);
  }

  if (colors && colors.length) {
    const c1 = colors[0];
    const c2 = colors[1] || colors[0];
    const bg1 = rgbToHex(Math.round(c1.r * 0.45), Math.round(c1.g * 0.45), Math.round(c1.b * 0.45));
    const bg2 = rgbToHex(Math.round(c2.r * 0.15), Math.round(c2.g * 0.15), Math.round(c2.b * 0.15));
    const accent = rgbToHex(c1.r, c1.g, c1.b);
    document.documentElement.style.setProperty('--player-dyn-bg1', bg1);
    document.documentElement.style.setProperty('--player-dyn-bg2', bg2);
    document.documentElement.style.setProperty('--player-dyn-accent', accent);
  } else {
    document.documentElement.style.setProperty('--player-dyn-bg1', '#1e1635');
    document.documentElement.style.setProperty('--player-dyn-bg2', '#07070d');
  }
}

function applyAccent(color) {
  State.settings.accent = color;
  document.documentElement.style.setProperty('--accent', color);
  const rgb = hexToRgb(color);
  if (rgb) document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  $$('.color-dot[data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color === color));
  $('#custom-accent').value = color;
  persistState();
}

function hexToRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function applyWallpaper(dataUrl) {
  const layer = $('#bg-layer');
  if (dataUrl) {
    layer.style.backgroundImage = `url('${dataUrl}')`;
    layer.classList.add('has-wallpaper');
    State.settings.wallpaper = dataUrl;
    extractColorsFromImage(dataUrl).then(applyAccentFromColors);
  } else {
    layer.style.backgroundImage = '';
    layer.classList.remove('has-wallpaper');
    State.settings.wallpaper = null;
  }
  persistState();
}

function applyBlur(v) {
  State.settings.blur = v;
  document.documentElement.style.setProperty('--blur', v + 'px');
  persistState();
}

function applyDim(v) {
  State.settings.dim = v;
  document.documentElement.style.setProperty('--dim', (v / 100).toString());
  persistState();
}

function extractColorsFromImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = 50;
        const h = 50;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const buckets = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max - min < 25) continue;
          if (max < 40 || min > 230) continue;
          const key = `${r >> 4},${g >> 4},${b >> 4}`;
          if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, n: 0 };
          buckets[key].r += r;
          buckets[key].g += g;
          buckets[key].b += b;
          buckets[key].n++;
        }
        const arr = Object.values(buckets)
          .sort((a, b) => b.n - a.n)
          .slice(0, 5)
          .map((o) => ({ r: Math.round(o.r / o.n), g: Math.round(o.g / o.n), b: Math.round(o.b / o.n) }));
        resolve(arr);
      } catch (e) {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

function applyAccentFromColors(colors) {
  if (!colors || !colors.length) return;
  if (State.settings.theme !== 'custom') return;
  const c = colors[0];
  applyAccent(rgbToHex(c.r, c.g, c.b));
}

/* ============== MULTI-MODE AUDIO VISUALIZER ============== */
let vizResizeObserver = null;

function resizeVisualizerCanvas() {
  const canvas = $('#visualizer');
  if (!canvas) return;
  const container = canvas.parentElement;
  const rect = container ? container.getBoundingClientRect() : canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.round(rect.width || canvas.offsetWidth || 300);
  const height = Math.round(rect.height || canvas.offsetHeight || 46);
  if (width > 0 && height > 0) {
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
  }
}

function stopVisualizer() {
  if (vizRAF) {
    cancelAnimationFrame(vizRAF);
    vizRAF = null;
  }
  const canvas = $('#visualizer');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function startVisualizer() {
  if (!State.settings.visualizer || !analyser || !State.isPlaying) {
    stopVisualizer();
    return;
  }
  const canvas = $('#visualizer');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  resizeVisualizerCanvas();
  if (!vizResizeObserver && window.ResizeObserver && canvas.parentElement) {
    vizResizeObserver = new ResizeObserver(() => {
      resizeVisualizerCanvas();
    });
    vizResizeObserver.observe(canvas.parentElement);
  }

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);
  cancelAnimationFrame(vizRAF);

  const draw = () => {
    if (!State.isPlaying || !State.settings.visualizer) {
      stopVisualizer();
      return;
    }
    vizRAF = requestAnimationFrame(draw);

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const logicalW = canvas.width / dpr;
    const logicalH = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, logicalW, logicalH);

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff';
    const mode = State.settings.vizMode || 'bars';

    if (mode === 'wave') {
      // Waveform Oscilloscope Mode
      analyser.getByteTimeDomainData(timeData);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const sliceWidth = logicalW / timeData.length;
      let x = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * logicalH) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
    } else if (mode === 'radial') {
      // Circular Ring Pulse Mode
      analyser.getByteFrequencyData(freqData);
      const cx = logicalW / 2;
      const cy = logicalH / 2;
      const radius = Math.min(cx, cy) * 0.65;
      const bars = 40;
      const step = Math.floor(freqData.length / bars);
      ctx.translate(cx, cy);
      for (let i = 0; i < bars; i++) {
        let v = 0;
        for (let j = 0; j < step; j++) v += freqData[i * step + j];
        v = v / step;
        const barH = (v / 255) * (Math.min(cx, cy) * 0.45);
        const rad = (i * 2 * Math.PI) / bars;
        ctx.rotate(rad);
        ctx.fillStyle = accent;
        ctx.fillRect(-1.25, radius, 2.5, barH);
        ctx.rotate(-rad);
      }
    } else if (mode === 'minimal') {
      // Minimal Ambient Bass Glow
      analyser.getByteFrequencyData(freqData);
      let bass = 0;
      for (let i = 0; i < 10; i++) bass += freqData[i];
      bass = bass / 10;
      const alpha = Math.min(0.85, (bass / 255) * 0.95);
      const grad = ctx.createLinearGradient(0, logicalH, 0, 0);
      grad.addColorStop(0, accent + Math.round(alpha * 220).toString(16).padStart(2, '0'));
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, logicalW, logicalH);
    } else {
      // Default Frequency Bars Mode
      analyser.getByteFrequencyData(freqData);
      const bars = 36;
      const step = Math.floor(freqData.length / bars);
      const bw = logicalW / bars;
      for (let i = 0; i < bars; i++) {
        let v = 0;
        for (let j = 0; j < step; j++) v += freqData[i * step + j];
        v = v / step;
        const h = Math.max(2, (v / 255) * logicalH * 0.92);
        const x = i * bw;
        const grad = ctx.createLinearGradient(0, logicalH, 0, logicalH - h);
        grad.addColorStop(0, accent + '22');
        grad.addColorStop(1, accent);
        ctx.fillStyle = grad;
        ctx.fillRect(x + bw * 0.15, logicalH - h, bw * 0.7, h);
      }
    }
    ctx.restore();
  };
  draw();
}

/* ============== MODAL, TOAST & CONTEXT MENU ============== */
function openModal(title, bodyHTML, onOK, hideOK = false) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  $('#modal').classList.add('open');
  $('#modal-ok').style.display = hideOK ? 'none' : '';
  $('#modal-ok').onclick = () => {
    if (onOK) onOK();
  };
  $('#modal-cancel').onclick = closeModal;
}

function closeModal() {
  $('#modal').classList.remove('open');
}

function showPrompt(title, placeholder, value, onOK) {
  openModal(
    title,
    `<input type="text" id="prompt-input" placeholder="${placeholder}" value="${escapeHtml(value)}">`,
    () => {
      onOK($('#prompt-input').value);
      closeModal();
    }
  );
  setTimeout(() => {
    const i = $('#prompt-input');
    i?.focus();
    i?.select();
  }, 50);
}

function showConfirm(title, msg, onOK) {
  openModal(title, `<p class="muted">${escapeHtml(msg)}</p>`, () => {
    onOK();
    closeModal();
  });
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function openContextMenu(x, y, items) {
  const menu = $('#ctx-menu');
  menu.innerHTML = items
    .map((it, i) =>
      it.sep
        ? '<div class="ctx-sep"></div>'
        : `<button class="ctx-item ${it.danger ? 'danger' : ''}" data-i="${i}"><span>${it.icon || ''}</span><span>${escapeHtml(it.label)}</span></button>`
    )
    .join('');
  menu.classList.add('open');
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 12);
  const top = Math.min(y, window.innerHeight - rect.height - 12);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  $$('.ctx-item', menu).forEach((b) => {
    b.onclick = () => {
      items[+b.dataset.i].onClick?.();
      closeContextMenu();
    };
  });
}

function closeContextMenu() {
  $('#ctx-menu').classList.remove('open');
}

/* ============== SLEEP TIMER ============== */
function setSleepTimer(minutes) {
  if (State.sleepTimerId) {
    clearTimeout(State.sleepTimerId);
    State.sleepTimerId = null;
    State.sleepEndTs = null;
  }
  $$('.chip[data-sleep]').forEach((c) => c.classList.toggle('active', +c.dataset.sleep === minutes));
  if (!minutes) {
    $('#sleep-info').textContent = '';
    toast('Sleep timer turned off');
    return;
  }
  State.sleepEndTs = Date.now() + minutes * 60000;
  State.sleepTimerId = setTimeout(() => {
    audio.pause();
    toast('Sleep timer: paused playback');
    $('#sleep-info').textContent = '';
  }, minutes * 60000);
  $('#sleep-info').textContent = `Playback will stop in ${minutes} minutes`;
  toast(`Sleep timer set for ${minutes} min`);
}

/* ============== VOLUME ICON HELPER ============== */
function volumeIconSVG(volume, muted) {
  const stroke = 'currentColor';
  const base = `viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const speaker = `<path d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4z"/>`;
  if (muted || volume <= 0.001) {
    return `<svg ${base}>${speaker}<line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;
  }
  if (volume < 0.34) {
    return `<svg ${base}>${speaker}<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/></svg>`;
  }
  if (volume < 0.67) {
    return `<svg ${base}>${speaker}<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a6.5 6.5 0 0 1 0 10"/></svg>`;
  }
  return `<svg ${base}>${speaker}<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a6.5 6.5 0 0 1 0 10"/><path d="M21.5 4.5a10 10 0 0 1 0 15"/></svg>`;
}

function updateVolumeIcon() {
  const btn = $('#mute-btn');
  if (!btn) return;
  btn.innerHTML = volumeIconSVG(audio.volume, audio.muted);
  btn.classList.toggle('active', audio.muted);
}

/* ============== EVENT BINDING ============== */
function bindEvents() {
  // Navigation
  $$('.nav-item').forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $$('.bottom-nav-item').forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $$('.link[data-goto]').forEach((b) => (b.onclick = () => showView(b.dataset.goto)));

  // Add music triggers
  $('#add-music-btn').onclick = () => showAddMusicMenu();
  $('#add-music-btn-mobile').onclick = () => showAddMusicMenu();
  $('#hero-add').onclick = () => showAddMusicMenu();
  $('#file-input').onchange = (e) => importFiles(e.target.files);
  $('#folder-input').onchange = (e) => importFiles(e.target.files);
  $('#lyrics-file-input').onchange = (e) => {
    if (e.target.files[0]) handleLyricsFileUpload(e.target.files[0]);
  };

  $('#hero-play').onclick = () => {
    if (!State.songs.length) {
      showAddMusicMenu();
      return;
    }
    const songIds = State.songs.map((s) => s.id);
    const shuffled = fisherYatesShuffle(songIds);
    State.originalQueue = [...songIds];
    State.shuffle = true;
    $('#shuffle-btn')?.classList.add('active');
    playSong(shuffled[0], shuffled);
  };

  // Mobile menu toggle
  $('#menu-btn').onclick = () => {
    $('#sidebar').classList.add('open');
    let bd = $('.sidebar-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      document.body.appendChild(bd);
      bd.onclick = () => {
        $('#sidebar').classList.remove('open');
        bd.classList.remove('show');
      };
    }
    bd.classList.add('show');
  };

  // Search & sorting
  $('#search-input').oninput = renderSongs;
  $('#sort-select').onchange = renderSongs;
  $('#search-clear-btn').onclick = () => {
    $('#search-input').value = '';
    renderSongs();
  };

  // Detail view back button
  $('#detail-back').onclick = () => showView('songs');

  // Playlist creation
  $('#new-playlist-btn').onclick = newPlaylist;

  // Themes and Accent
  $$('.theme-pick').forEach((b) => (b.onclick = () => applyTheme(b.dataset.theme)));
  $$('.color-dot[data-color]').forEach((b) => (b.onclick = () => applyAccent(b.dataset.color)));
  $('#custom-accent').oninput = (e) => applyAccent(e.target.value);

  // Player Appearance Style Selection
  $$('#player-style-grid .player-style-card').forEach((btn) => {
    btn.onclick = () => {
      applyPlayerStyle(btn.dataset.style);
      toast(`Player style: ${btn.dataset.style.charAt(0).toUpperCase() + btn.dataset.style.slice(1)}`);
    };
  });
  const resetStyleBtn = $('#btn-reset-player-style');
  if (resetStyleBtn) {
    resetStyleBtn.onclick = () => {
      applyPlayerStyle('glass');
      toast('Player style reset to Glass');
    };
  }

  // Custom Wallpaper
  $('#wallpaper-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => applyWallpaper(r.result);
    r.readAsDataURL(file);
  };
  $('#wallpaper-clear').onclick = () => applyWallpaper(null);
  $('#blur-slider').oninput = (e) => applyBlur(+e.target.value);
  $('#dim-slider').oninput = (e) => applyDim(+e.target.value);

  // Behavior Toggles
  $('#anim-toggle').onchange = (e) => {
    State.settings.animations = e.target.checked;
    document.body.classList.toggle('no-anim', !e.target.checked);
    persistState();
  };
  $('#viz-toggle').onchange = (e) => {
    State.settings.visualizer = e.target.checked;
    persistState();
    if (e.target.checked) startVisualizer();
  };
  $('#rotate-toggle').onchange = (e) => {
    State.settings.rotateArt = e.target.checked;
    persistState();
    $('#art-frame')?.classList.toggle('spin', State.isPlaying && e.target.checked);
    $('#art-disc')?.classList.toggle('spin', State.isPlaying && e.target.checked);
  };
  $('#autoplay-toggle').onchange = (e) => {
    State.settings.autoplay = e.target.checked;
    persistState();
  };
  $('#mediasession-toggle').onchange = (e) => {
    State.settings.mediaSession = e.target.checked;
    persistState();
  };

  // Visualizer Mode Chips
  $$('#viz-mode-chips .chip').forEach((c) => {
    c.onclick = () => {
      $$('#viz-mode-chips .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      State.settings.vizMode = c.dataset.vizmode;
      persistState();
      startVisualizer();
    };
  });

  // Sleep Timer Chips
  $$('.chip[data-sleep]').forEach((c) => (c.onclick = () => setSleepTimer(+c.dataset.sleep)));

  // Clear Library
  $('#clear-library').onclick = () => {
    showConfirm('Delete All Music & Playlists?', 'This will permanently remove all imported audio and playlists.', async () => {
      await idbClear('files');
      await idbClear('meta');
      await idbClear('playlists');
      await idbClear('favorites');
      await idbClear('history');
      await idbClear('lyrics');

      State.songs = [];
      State.favorites = [];
      State.recent = [];
      State.playlists = [];
      State.queue = [];
      State.queueIndex = -1;
      State.currentSong = null;
      audio.pause();
      audio.src = '';

      for (const url of State.blobUrls.values()) URL.revokeObjectURL(url);
      State.blobUrls.clear();

      persistState();
      renderAll();
      updateMini();
      toast('Library cleared');
    });
  };

  // Backup & Restore
  $('#btn-export-backup').onclick = exportBackupJSON;
  $('#backup-file-input').onchange = (e) => {
    if (e.target.files[0]) restoreBackupJSON(e.target.files[0]);
  };

  // Request Persistent Storage Button
  $('#btn-req-persistence').onclick = async () => {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      const isPersisted = await navigator.storage.persist();
      toast(isPersisted ? 'Persistent storage granted!' : 'Storage request completed');
      updateStorageMetrics();
    } else {
      toast('Persistent storage API not supported by browser');
    }
  };

  // Mini Player
  $('#mini-play').onclick = togglePlay;
  $('#mini-prev').onclick = prevTrack;
  $('#mini-next').onclick = () => nextTrack();
  $('#mini-like').onclick = () => State.currentSong && toggleFavorite(State.currentSong.id);
  $('#mini-progress').onclick = (e) => {
    if (!audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
    updateProgress();
  };
  $('#mini-player').onclick = (e) => {
    if (e.target.closest('button') || e.target.closest('#mini-progress')) return;
    openFull();
  };
  $('#expand-btn').onclick = openFull;

  // Full Player Controls
  $('#full-close').onclick = closeFull;
  $('#play-btn').onclick = togglePlay;
  $('#next-btn').onclick = () => nextTrack();
  $('#prev-btn').onclick = prevTrack;
  $('#shuffle-btn').onclick = toggleShuffle;
  $('#repeat-btn').onclick = toggleRepeat;
  $('#like-btn').onclick = () => State.currentSong && toggleFavorite(State.currentSong.id);
  $('#addqueue-btn').onclick = () => State.currentSong && showAddToPlaylist(State.currentSong.id);
  $('#fullscreen-btn').onclick = toggleFullscreen;
  $('#lyrics-btn').onclick = () => {
    switchSidePanel('lyrics');
    openSidePanel();
  };
  $('#full-queue-btn').onclick = () => {
    switchSidePanel('queue');
    if ($('#side-panel').classList.contains('open') && window.innerWidth <= 900) {
      closeSidePanel();
    } else {
      openSidePanel();
    }
  };

  $('#seek').oninput = (e) => {
    if (audio.duration) {
      const pct = e.target.value / 10;
      audio.currentTime = (pct / 100) * audio.duration;
      e.target.style.setProperty('--seek-pct', pct + '%');
    }
  };
  $('#volume').oninput = (e) => {
    const v = e.target.value / 100;
    audio.volume = v;
    State.settings.volume = v;
    if (v > 0 && audio.muted) audio.muted = false;
    e.target.style.setProperty('--seek-pct', e.target.value + '%');
    updateVolumeIcon();
    persistState();
  };
  $('#mute-btn').onclick = () => {
    audio.muted = !audio.muted;
    updateVolumeIcon();
    toast(audio.muted ? 'Muted' : 'Unmuted');
  };
  audio.addEventListener('volumechange', updateVolumeIcon);
  $('#speed-select').onchange = (e) => {
    State.settings.speed = +e.target.value;
    audio.playbackRate = State.settings.speed;
    persistState();
  };

  // Side Panel Tabs (Queue vs Lyrics)
  $$('.side-tab').forEach((t) => {
    t.onclick = () => switchSidePanel(t.dataset.side);
  });
  $('#btn-clear-queue').onclick = clearQueue;
  $('#btn-import-lrc').onclick = () => $('#lyrics-file-input').click();
  $('#btn-edit-lyrics').onclick = showLyricsEditor;
  $('#side-panel-close').onclick = closeSidePanel;
  $('#side-panel-backdrop').onclick = closeSidePanel;

  // Drag and Drop audio & lyrics
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    $('#drop-overlay').classList.add('active');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      $('#drop-overlay').classList.remove('active');
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    $('#drop-overlay').classList.remove('active');
    const items = e.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      const files = [];
      const proms = [];
      for (const it of items) {
        const entry = it.webkitGetAsEntry?.();
        if (entry) proms.push(traverseEntry(entry, files));
      }
      await Promise.all(proms);
      if (files.length) importFiles(files);
    } else {
      importFiles(e.dataTransfer.files);
    }
  });

  // Close overlays on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctx-menu') && !e.target.closest('[data-act="menu"]')) closeContextMenu();
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        nextTrack();
        break;
      case 'ArrowLeft':
        prevTrack();
        break;
      case 'ArrowUp':
        e.preventDefault();
        audio.volume = Math.min(1, audio.volume + 0.05);
        if (audio.muted) audio.muted = false;
        State.settings.volume = audio.volume;
        $('#volume').value = audio.volume * 100;
        $('#volume').style.setProperty('--seek-pct', audio.volume * 100 + '%');
        updateVolumeIcon();
        persistState();
        break;
      case 'ArrowDown':
        e.preventDefault();
        audio.volume = Math.max(0, audio.volume - 0.05);
        State.settings.volume = audio.volume;
        $('#volume').value = audio.volume * 100;
        $('#volume').style.setProperty('--seek-pct', audio.volume * 100 + '%');
        updateVolumeIcon();
        persistState();
        break;
      case 'KeyM':
        audio.muted = !audio.muted;
        updateVolumeIcon();
        toast(audio.muted ? 'Muted' : 'Unmuted');
        break;
      case 'KeyL':
        if (State.currentSong) toggleFavorite(State.currentSong.id);
        break;
      case 'KeyS':
        toggleShuffle();
        break;
      case 'KeyR':
        toggleRepeat();
        break;
      case 'KeyF':
        toggleFullscreen();
        break;
      case 'Slash':
        e.preventDefault();
        showView('songs');
        $('#search-input')?.focus();
        break;
      case 'Escape':
        if ($('#full-player').classList.contains('open')) closeFull();
        if ($('#modal').classList.contains('open')) closeModal();
        if ($('#meta-editor-modal').classList.contains('open')) $('#meta-editor-modal').classList.remove('open');
        break;
    }
  });

  // PWA Install Triggers
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    State.deferredInstallPrompt = e;
    const topBtn = $('#pwa-install-topbar-btn');
    if (topBtn) topBtn.style.display = 'inline-flex';
    const installBtn = $('#pwa-install-btn');
    if (installBtn) installBtn.style.display = 'inline-flex';
  });

  $('#pwa-install-btn').onclick = triggerPWAInstall;
  $('#pwa-install-topbar-btn').onclick = triggerPWAInstall;
}

function triggerPWAInstall() {
  if (State.deferredInstallPrompt) {
    State.deferredInstallPrompt.prompt();
    State.deferredInstallPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        toast('Harxora Vibez installed!');
        $('#pwa-install-topbar-btn').style.display = 'none';
      }
      State.deferredInstallPrompt = null;
    });
  } else {
    toast('Use your browser menu to "Add to Home Screen" or "Install"');
  }
}

function traverseEntry(entry, files) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (f) => {
          files.push(f);
          resolve();
        },
        () => resolve()
      );
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readAll = () => new Promise((res) => reader.readEntries((es) => res(es)));
      (async () => {
        let entries = await readAll();
        while (entries.length) {
          for (const e of entries) await traverseEntry(e, files);
          entries = await readAll();
        }
        resolve();
      })();
    } else resolve();
  });
}

function showAddMusicMenu() {
  openModal(
    'Add Music to Library',
    `
    <p class="muted" style="margin-bottom:12px">Select files from your device to store locally for offline playback.</p>
    <div style="display:flex; flex-direction:column; gap:10px">
      <button class="btn-primary" id="pick-files">Select Audio Files (MP3, WAV, FLAC, M4A)</button>
      <button class="btn-ghost" id="pick-folder" style="width:100%">Import Entire Music Folder</button>
      <p class="muted" style="margin-top:8px; font-size:0.82rem">💡 You can also drag & drop music or lyrics files anywhere onto the app.</p>
    </div>`,
    null,
    true
  );
  $('#pick-files').onclick = () => {
    closeModal();
    $('#file-input').click();
  };
  $('#pick-folder').onclick = () => {
    closeModal();
    $('#folder-input').click();
  };
}

/* ============== FULL PLAYER EXPANSION & SIDE PANELS ============== */
function openFull() {
  if (!State.currentSong) return;
  $('#full-player').classList.add('open');
  updateFullPlayer();
  if (window.innerWidth > 900) {
    $('#side-panel')?.classList.add('open');
  }
  renderQueue();
  loadLyricsForSong(State.currentSong.id);
  setTimeout(startVisualizer, 100);
}

function closeFull() {
  $('#full-player').classList.remove('open');
  closeSidePanel();
}

function switchSidePanel(which) {
  const sideQueue = $('#side-queue');
  const sideLyrics = $('#side-lyrics');
  if (sideQueue) sideQueue.style.display = which === 'queue' ? 'flex' : 'none';
  if (sideLyrics) sideLyrics.style.display = which === 'lyrics' ? 'flex' : 'none';
  $$('.side-tab').forEach((t) => {
    const isAct = t.dataset.side === which;
    t.classList.toggle('active', isAct);
    t.setAttribute('aria-selected', isAct);
  });
}

function openSidePanel() {
  $('#side-panel')?.classList.add('open');
  if (window.innerWidth <= 900) {
    $('#side-panel-backdrop')?.classList.add('show');
  }
}

function closeSidePanel() {
  $('#side-panel')?.classList.remove('open');
  $('#side-panel-backdrop')?.classList.remove('show');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
  if (!$('#full-player').classList.contains('open')) openFull();
}

/* ============== APPLICATION BOOTSTRAP ============== */
async function init() {
  loadPersistedState();

  // Apply saved theme & settings
  applyTheme(State.settings.theme || 'dark');
  applyPlayerStyle(State.settings.playerStyle || 'glass');
  applyAccent(State.settings.accent || '#7c5cff');
  applyBlur(State.settings.blur ?? 30);
  applyDim(State.settings.dim ?? 55);

  if (State.settings.wallpaper) {
    $('#bg-layer').style.backgroundImage = `url('${State.settings.wallpaper}')`;
    $('#bg-layer').classList.add('has-wallpaper');
  }
  document.body.classList.toggle('no-anim', !State.settings.animations);

  // Settings inputs
  $('#blur-slider').value = State.settings.blur;
  $('#dim-slider').value = State.settings.dim;
  $('#anim-toggle').checked = State.settings.animations;
  $('#viz-toggle').checked = State.settings.visualizer;
  $('#rotate-toggle').checked = State.settings.rotateArt;
  $('#autoplay-toggle').checked = State.settings.autoplay;
  $('#mediasession-toggle').checked = State.settings.mediaSession ?? true;
  $('#speed-select').value = String(State.settings.speed);
  $('#volume').value = State.settings.volume * 100;
  $('#volume').style.setProperty('--seek-pct', State.settings.volume * 100 + '%');
  audio.volume = State.settings.volume;
  audio.playbackRate = State.settings.speed;
  updateVolumeIcon();

  // Highlight active viz mode
  $$('#viz-mode-chips .chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.vizmode === (State.settings.vizMode || 'bars'));
  });

  bindEvents();

  // Initialize IndexedDB database and migrate any legacy data
  try {
    await openDB();
    await checkAndMigrateLegacy();

    State.songs = await idbAll('meta');
    const plRecords = await idbAll('playlists');
    if (plRecords.length) State.playlists = plRecords;
    const favRecords = await idbAll('favorites');
    if (favRecords.length) State.favorites = favRecords.map((r) => r.id);
  } catch (e) {
    console.warn('DB initialization error', e);
  }

  renderAll();

  // Register PWA Service Worker for complete offline availability
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then(() => console.log('Harxora Vibez Service Worker active'))
      .catch((err) => console.warn('Service worker registration failed', err));
  }
}

/* Background & Visibility: Suspend visualizer RAF loop when screen is locked or hidden to preserve battery */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (vizRAF) {
      cancelAnimationFrame(vizRAF);
      vizRAF = null;
    }
  } else {
    if (State.isPlaying && State.settings.visualizer) {
      startVisualizer();
    }
  }
});

document.addEventListener('DOMContentLoaded', init);

/* Cleanup blob URLs before unload */
window.addEventListener('beforeunload', () => {
  for (const url of State.blobUrls.values()) URL.revokeObjectURL(url);
});
