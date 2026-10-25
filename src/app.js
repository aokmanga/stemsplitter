/* ═══════════════════════════════════════════════════════════════════
   StemSplitter — app.js
   Gestisce: import file, chiamate Tauri, Web Audio API, waveform,
             playback con mute/solo/volume per traccia
═══════════════════════════════════════════════════════════════════ */

// Tauri 1.x: le API sono su sottonamespace separati
const invoke = window._invoke;
const listen  = window._listen;

// ── Costanti ──────────────────────────────────────────────────────
const TRACK_CONFIG = [
  { key: 'vocals', label: 'Voce',    icon: '🎤', color: 'var(--vocals-color)', wave: 'var(--vocals-wave)' },
  { key: 'drums',  label: 'Batteria', icon: '🥁', color: 'var(--drums-color)',  wave: 'var(--drums-wave)' },
  { key: 'bass',   label: 'Basso',   icon: '🎸', color: 'var(--bass-color)',   wave: 'var(--bass-wave)' },
  { key: 'other',  label: 'Altro',   icon: '🎹', color: 'var(--other-color)',  wave: 'var(--other-wave)' },
];

// ── Stato globale ─────────────────────────────────────────────────
let audioCtx = null;
let state = {
  playbackRate: 1,
  masterGain: null,
  tracks: {},          // key -> { buffer, sourceNode, gainNode, muted, solo, volume, loaded }
  isPlaying: false,
  startTime: 0,        // AudioContext.currentTime al momento del play
  pauseOffset: 0,      // secondi di posizione corrente
  duration: 0,
  animFrame: null,
  stemPaths: null,
  currentFile: null,
  outputDir: null,
};

// ── Elementi DOM ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const homeSection      = $('home-section');
const processingSection = $('processing-section');
const dawSection       = $('daw-section');
const dropZone         = $('drop-zone');
const btnOpenFile      = $('btn-open-file');
const btnPlay          = $('btn-play');
const btnStop          = $('btn-stop');
const btnRewind        = $('btn-rewind');
const btnBackHome      = $('btn-back-home');
const playhead         = $('playhead');
const timeline         = $('timeline');
const timeCurrent      = $('time-current');
const timeTotal        = $('time-total');
const transportFilename = $('transport-filename');
const transportDuration = $('transport-duration');
const tracksContainer  = $('tracks-container');
const demucsStatus     = $('demucs-status');
const progressBar      = $('progress-bar');
const outputModal      = $('output-modal');
const modalDirPath     = $('modal-dir-path');
const btnChangeDir     = $('btn-change-dir');
const btnModalCancel   = $('btn-modal-cancel');
const btnModalConfirm  = $('btn-modal-confirm');

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  await checkDemucs();
  await loadConfig();
  setupEventListeners();
  setupNativeEvents();
  listenDemucsProgress();
  await loadSessions();
  showSection('home');
}

async function loadConfig() {
  try {
    const cfg = await invoke('get_config');
    state.outputDir = cfg.library_path;
    const el = document.getElementById('library-path-label');
    if (el) el.textContent = cfg.library_path;
    const modal = document.getElementById('modal-dir-path');
    if (modal) modal.textContent = cfg.library_path;
  } catch(e) {
    console.error('loadConfig error:', e);
  }
}

async function loadSessions() {
  const list = document.getElementById('sessions-list');
  const empty = document.getElementById('sessions-empty');
  if (!list) return;

  // Rimuovi sessioni precedenti (mantieni l'empty placeholder)
  list.querySelectorAll('.session-item').forEach(el => el.remove());

  try {
    const sessions = await invoke('list_sessions', { libraryPath: state.outputDir });
    if (!sessions || sessions.length === 0) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = 'session-item';
      const dur = formatTime(session.duration);
      item.innerHTML = `
        <div class="session-icon">🎵</div>
        <div class="session-info">
          <div class="session-name"></div>
          <div class="session-meta"></div>
        </div>
        <button class="btn-secondary small session-open-btn">Apri →</button>
      `;
      // textContent (non innerHTML): il nome della cartella non viene mai interpretato come HTML
      item.querySelector('.session-name').textContent = session.name;
      item.querySelector('.session-meta').textContent = `${dur} \u00A0·\u00A0 ${formatDate(session.date)}`;
      item.addEventListener('click', () => openSession(session));
      list.appendChild(item);
    });
  } catch(e) {
    console.error('loadSessions error:', e);
    if (empty) { empty.style.display = 'flex'; empty.querySelector('p').textContent = 'Errore lettura libreria.'; }
  }
}

async function openSession(session) {
  state.currentFile = session.path;
  state.stemPaths = session.stems;
  try {
    await loadStems(session.stems);
    showSection('daw');
    setupTransportInfo();
  } catch (err) {
    alert(`Impossibile aprire il brano:\n${err.message || err}`);
    resetToImport();
  }
}

async function checkDemucs() {
  try {
    const result = await invoke('check_demucs');
    const [, info] = result.split(':');
    const [, version] = info.split('|');
    demucsStatus.className = 'status-badge ok';
    demucsStatus.querySelector('.label').textContent = `demucs ${version || 'pronto'}`;
  } catch (err) {
    demucsStatus.className = 'status-badge error';
    demucsStatus.querySelector('.label').textContent = 'demucs non trovato';
    demucsStatus.title = err;
  }
}

function setupEventListeners() {
  $('btn-reset').addEventListener('click', resetTracks);
  $('master-volume').addEventListener('input', e => setMasterVolume(e.target.value));
  $('master-speed').addEventListener('input', e => setMasterSpeed(e.target.value));
  btnOpenFile.addEventListener('click', openFile);
  btnPlay.addEventListener('click', togglePlay);
  btnStop.addEventListener('click', stopPlayback);
  btnRewind.addEventListener('click', rewind);
  btnBackHome.addEventListener('click', resetToImport);
  timeline.addEventListener('click', seekFromTimeline);

  // pick_output_dir ora è asincrono con callback -> ascoltiamo l'evento 'dir-selected'
  btnChangeDir.addEventListener('click', () => window._invoke('pick_output_dir'));
  document.getElementById('btn-change-library')?.addEventListener('click', () => window._invoke('pick_output_dir'));
  btnModalCancel.addEventListener('click', () => {
    outputModal.classList.add('hidden');
    resetToImport();
  });

  btnModalConfirm.addEventListener('click', () => {
    outputModal.classList.add('hidden');
    startDemucs();
  });
}

// setupNativeEvents sostituisce setupDragDrop e aggiunge gli event listener Tauri
async function setupNativeEvents() {
  const appWindow = window._appWindow;

  // ── Drag & drop nativo da Finder ─────────────────────────────────
  // In Tauri 1.x il drag&drop non espone file.path nella WebView:
  // bisogna ascoltare l'evento nativo 'tauri://file-drop'
  await appWindow.listen('tauri://file-drop', ({ payload }) => {
    // payload è un array di path assoluti
    const paths = payload;
    if (!paths || paths.length === 0) return;
    const filePath = paths[0];
    // Accetta solo formati audio noti
    const audioExts = ['.mp3','.wav','.flac','.m4a','.ogg','.aac','.aiff','.opus','.wma'];
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    if (audioExts.includes(ext)) {
      handleFileSelected(filePath);
    }
    dropZone.classList.remove('drag-over');
  });

  // Feedback visivo durante il drag sopra la finestra
  await appWindow.listen('tauri://file-drop-hover', () => {
    dropZone.classList.add('drag-over');
  });

  await appWindow.listen('tauri://file-drop-cancelled', () => {
    dropZone.classList.remove('drag-over');
  });

  // ── Risposta al file picker (pick_audio_file emette 'file-selected') ──
  await appWindow.listen('file-selected', ({ payload }) => {
    if (payload && typeof payload === 'string') {
      handleFileSelected(payload);
    }
  });

  // ── Risposta al folder picker (pick_output_dir emette 'dir-selected') ──
  await appWindow.listen('dir-selected', async ({ payload }) => {
    if (payload && typeof payload === 'string') {
      state.outputDir = payload;
      modalDirPath.textContent = payload;
      const label = document.getElementById('library-path-label');
      if (label) label.textContent = payload;
      await invoke('save_config', { libraryPath: payload });
      await loadSessions();
    }
  });
}

function listenDemucsProgress() {
  listen('demucs-progress', ({ payload }) => {
    const { status, message, percent } = payload;
    $('processing-title').textContent = message;

    if (status === 'starting') {
      animateProgressBar();
    } else if (status === 'running' && typeof percent === 'number') {
      // Percentuale reale letta da demucs: sostituisce quella simulata
      stopProgressTimer();
      progressBar.style.width = `${percent}%`;
    } else if (status === 'converting' || status === 'done') {
      stopProgressTimer();
      progressBar.style.width = '100%';
    }
  });
}

// ── File Handling ─────────────────────────────────────────────────
async function openFile() {
  // pick_audio_file è async con callback: non ritorna il path direttamente
  // ma lo emette come evento 'file-selected' (ascoltato in setupNativeEvents)
  try {
    await invoke('pick_audio_file');
  } catch (err) {
    console.error('Errore apertura file dialog:', err);
  }
}

async function handleFileSelected(filePath) {
  state.currentFile = filePath;
  // state.outputDir è già impostato dalla config — mostra solo il modal di conferma
  modalDirPath.textContent = state.outputDir;
  outputModal.classList.remove('hidden');
}

async function startDemucs() {
  showSection('processing');
  animateProgressBar();

  try {
    const stemPaths = await invoke('run_demucs', {
      inputPath: state.currentFile,
      outputDir: state.outputDir,
    });

    state.stemPaths = stemPaths;
    await loadStems(stemPaths);
    showSection('daw');
    setupTransportInfo();
    // Aggiorna la lista sessioni in background
    loadSessions();

  } catch (err) {
    stopProgressTimer();
    alert(`Errore durante la separazione:\n${err.message || err}`);
    resetToImport();
  }
}

// ── Audio Loading ─────────────────────────────────────────────────
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

async function loadStems(paths) {
  // Crea i nodi gain per ogni traccia
  const ctx = getAudioContext();
  state.tracks = {};
  if (state.masterGain) { try { state.masterGain.disconnect(); } catch (_) {} }
  state.masterGain = ctx.createGain();
  state.masterGain.gain.value = parseFloat($('master-volume')?.value || 1);
  state.masterGain.connect(ctx.destination);

  // Build tracks container UI first
  buildTracksUI();

  // Carica ogni stem in parallelo
  const loadPromises = TRACK_CONFIG.map(cfg => loadStem(cfg.key, paths[cfg.key]));
  await Promise.all(loadPromises);

  // Solo gli stem caricati davvero contano (uno stem mancante non rompe il resto)
  const loaded = Object.values(state.tracks).filter(t => t.buffer);
  if (loaded.length === 0) throw new Error('Nessuna traccia audio caricabile in questa cartella.');
  state.duration = Math.max(...loaded.map(t => t.buffer.duration));
  updateTimeDisplay(0);
}

async function loadStem(key, filePath) {
  const ctx = getAudioContext();

  // Aggiorna UI: loading
  setTrackLoading(key, true);

  try {
    // Leggi il file come base64 via Tauri
    const b64 = await invoke('read_audio_file', { path: filePath });
    const arrayBuffer = base64ToArrayBuffer(b64);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Gain node
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;
    gainNode.connect(state.masterGain);

    state.tracks[key] = {
      buffer: audioBuffer,
      gainNode,
      sourceNode: null,
      muted: false,
      solo: false,
      volume: 1.0,
      loaded: true,
    };

    setTrackLoading(key, false);
    drawWaveform(key, audioBuffer);

  } catch(err) {
    console.error(`Errore caricamento stem ${key}:`, err);
    setTrackLoading(key, false, 'Traccia non disponibile');
    markTrackMissing(key);
  }
}

// Stem assente o illeggibile: la riga resta visibile ma disattivata
function markTrackMissing(key) {
  const row = document.querySelector(`[data-track="${key}"]`);
  if (!row) return;
  row.classList.add('missing');
  row.style.opacity = '0.5';
  row.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
}

// ── Waveform Drawing ──────────────────────────────────────────────
function drawWaveform(key, audioBuffer) {
  const canvas = document.querySelector(`[data-waveform="${key}"]`);
  if (!canvas) return;

  const cfg = TRACK_CONFIG.find(t => t.key === key);
  const ctx2d = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Resize canvas to actual pixels
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx2d.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  // Mix down to mono per la visualizzazione
  const rawData = audioBuffer.getChannelData(0);
  const samples = W * 2; // 2 campioni per pixel
  const blockSize = Math.floor(rawData.length / samples);
  const filtered = [];

  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[i * blockSize + j]);
    }
    filtered.push(sum / blockSize);
  }

  // Normalizza
  const max = Math.max(...filtered, 0.001);
  const normalized = filtered.map(v => v / max);

  // Disegna
  ctx2d.clearRect(0, 0, W, H);

  // Sfondo
  ctx2d.fillStyle = 'transparent';
  ctx2d.fillRect(0, 0, W, H);

  // Linea centrale
  ctx2d.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(0, H / 2);
  ctx2d.lineTo(W, H / 2);
  ctx2d.stroke();

  // Waveform
  const waveColor = getComputedStyle(document.documentElement)
    .getPropertyValue(cfg.wave.replace('var(', '').replace(')', '').trim())
    || cfg.wave;

ctx2d.fillStyle = state.trackColors?.[key] || waveColor || cfg.wave;
  
const barWidth = W / normalized.length;

  for (let i = 0; i < normalized.length; i++) {
    const x = i * barWidth;
    const amplitude = normalized[i] * (H / 2) * 0.9;

    // Forma simmetrica
    ctx2d.fillRect(x, H / 2 - amplitude, Math.max(barWidth - 0.5, 0.5), amplitude * 2);
  }

  // Gradient overlay per profondità
  const grad = ctx2d.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0.3)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, W, H);
}

// ── Playback ──────────────────────────────────────────────────────
function togglePlay() {
  if (state.isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  let rate = state.renderedRate || 1;
  // Se manca anche un solo buffer "stirato" si riparte a 1x: evita posizione sbagliata
  const ready = Object.values(state.tracks).filter(t => t.buffer);
  if (rate !== 1 && !ready.every(t => t.stretched)) rate = 1;
  state.playRate = rate;
  const offset = state.pauseOffset;

  // Crea source node per ogni traccia
  Object.entries(state.tracks).forEach(([key, track]) => {
    if (!track.buffer) return;

    // Rimuovi source precedente
    if (track.sourceNode) {
      try { track.sourceNode.disconnect(); } catch (_) {}
    }

    const source = ctx.createBufferSource();
    source.buffer = rate !== 1 ? track.stretched : track.buffer;
    source.connect(track.gainNode);
    source.start(0, offset / rate);
    track.sourceNode = source;

    // Applica mute/solo
    applyGain(key);
  });

  state.startTime = ctx.currentTime - offset / rate;
  state.isPlaying = true;
  btnPlay.textContent = '⏸';
  btnPlay.classList.add('playing');

  // Aggiorna la timeline di posizione
  tickPlayhead();
}

function pausePlayback() {
  const ctx = getAudioContext();
  state.pauseOffset = (ctx.currentTime - state.startTime) * (state.playRate || 1);

  stopAllSources();
  state.isPlaying = false;
  btnPlay.textContent = '▶';
  btnPlay.classList.remove('playing');

  if (state.animFrame) cancelAnimationFrame(state.animFrame);
}

function stopPlayback() {
  stopAllSources();
  state.isPlaying = false;
  state.pauseOffset = 0;
  btnPlay.textContent = '▶';
  btnPlay.classList.remove('playing');
  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  updatePlayheadPosition(0);
  updateTimeDisplay(0);
}

function rewind() {
  const wasPlaying = state.isPlaying;
  stopPlayback();
  if (wasPlaying) startPlayback();
}

function stopAllSources() {
  Object.values(state.tracks).forEach(track => {
    if (track.sourceNode) {
      try { track.sourceNode.stop(); track.sourceNode.disconnect(); } catch (_) {}
      track.sourceNode = null;
    }
  });
}

function tickPlayhead() {
  if (!state.isPlaying) return;

  const ctx = getAudioContext();
  const elapsed = (ctx.currentTime - state.startTime) * (state.playRate || 1);

  if (elapsed >= state.duration) {
    stopPlayback();
    return;
  }

  updatePlayheadPosition(elapsed / state.duration);
  updateTimeDisplay(elapsed);

  state.animFrame = requestAnimationFrame(tickPlayhead);
}

function updatePlayheadPosition(ratio) {
  const w = timeline.offsetWidth;
  playhead.style.left = `${ratio * w}px`;

  // Aggiorna anche i playhead sulle singole tracce
  document.querySelectorAll('.track-playhead').forEach(ph => {
    const tw = ph.parentElement.offsetWidth;
    ph.style.left = `${ratio * tw}px`;
  });
}

function updateTimeDisplay(seconds) {
  timeCurrent.textContent = formatTime(seconds);
}

function seekFromTimeline(e) {
  const rect = timeline.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const seekTo = ratio * state.duration;

  state.pauseOffset = seekTo;
  updatePlayheadPosition(ratio);
  updateTimeDisplay(seekTo);

  if (state.isPlaying) {
    stopAllSources();
    startPlayback();
  }
}

// ── Mute / Solo / Volume ──────────────────────────────────────────
function toggleMute(key) {
  const track = state.tracks[key];
  if (!track) return;

  track.muted = !track.muted;

  const btn = document.querySelector(`[data-mute="${key}"]`);
  btn?.classList.toggle('active', track.muted);

  const row = document.querySelector(`[data-track="${key}"]`);
  row?.classList.toggle('muted', track.muted);

  applyGain(key);
}

function toggleSolo(key) {
  const track = state.tracks[key];
  if (!track) return;

  track.solo = !track.solo;

  const btn = document.querySelector(`[data-solo="${key}"]`);
  btn?.classList.toggle('active', track.solo);

  const row = document.querySelector(`[data-track="${key}"]`);
  row?.classList.toggle('soloed', track.solo);

  // Ricalcola tutti i gain
  Object.keys(state.tracks).forEach(k => applyGain(k));
}

function setVolume(key, value) {
  const track = state.tracks[key];
  if (!track) return;

  track.volume = parseFloat(value);
  applyGain(key);

  const label = document.querySelector(`[data-vol-label="${key}"]`);
  if (label) label.textContent = `${Math.round(track.volume * 100)}%`;
}

function applyGain(key) {
  const track = state.tracks[key];
  if (!track?.gainNode) return;

  const anySoloed = Object.values(state.tracks).some(t => t.solo);

  let gain = track.volume;

  if (track.muted) {
    gain = 0;
  } else if (anySoloed && !track.solo) {
    gain = 0;
  }

  track.gainNode.gain.setTargetAtTime(gain, getAudioContext().currentTime, 0.02);
}

// ── UI Building ───────────────────────────────────────────────────
function buildTracksUI() {
  tracksContainer.innerHTML = '';

  TRACK_CONFIG.forEach(cfg => {
    const track = document.createElement('div');
    track.className = 'track';
    track.dataset.track = cfg.key;

    track.innerHTML = `
      <div class="track-sidebar">
          <div class="track-color-bar" style="background:${cfg.color}" data-colorpick="${cfg.key}" title="Cambia colore"></div>        <div class="track-info">
          <div class="track-icon">${cfg.icon}</div>
          <div class="track-name">${cfg.label}</div>
          <div class="track-controls">
            <button class="btn-track mute-btn" data-mute="${cfg.key}" title="Mute">M</button>
            <button class="btn-track solo-btn" data-solo="${cfg.key}" title="Solo">S</button>
          </div>
        </div>
        <div class="volume-wrap">
          <span class="volume-label">VOL</span>
          <input
            type="range"
            class="volume-slider"
            min="0" max="1.5" step="0.01" value="1"
            data-volume="${cfg.key}"
            title="Volume"
          />
          <span class="volume-value" data-vol-label="${cfg.key}">100%</span>
        </div>
      </div>
      <div class="track-waveform-wrap">
        <canvas class="track-waveform-canvas" data-waveform="${cfg.key}"></canvas>
        <div class="track-playhead"></div>
        <div class="track-loading" data-loading="${cfg.key}">
          <div class="mini-spinner"></div>
          <span>Caricamento…</span>
        </div>
      </div>
    `;

    tracksContainer.appendChild(track);

    // Event listeners sui controlli
    track.querySelector(`[data-mute="${cfg.key}"]`)
      .addEventListener('click', () => toggleMute(cfg.key));

    track.querySelector(`[data-solo="${cfg.key}"]`)
      .addEventListener('click', () => toggleSolo(cfg.key));

    track.querySelector(`[data-volume="${cfg.key}"]`)
      .addEventListener('input', e => setVolume(cfg.key, e.target.value));
    
    track.querySelector(`[data-colorpick="${cfg.key}"]`)
      .addEventListener('click', () => openColorPicker(cfg.key));
    
      // Click sulla waveform per seek
    track.querySelector('.track-waveform-wrap')
      .addEventListener('click', e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const seekTo = ratio * state.duration;
        state.pauseOffset = seekTo;
        updatePlayheadPosition(ratio);
        updateTimeDisplay(seekTo);
        if (state.isPlaying) {
          stopAllSources();
          startPlayback();
        }
      });
  });
}

function openColorPicker(key) {
  const input = document.createElement('input');
  input.type = 'color';
  input.style.position = 'fixed';
  input.style.opacity = '0';
  input.value = state.trackColors?.[key] || '#4f8ef7';
  document.body.appendChild(input);
  input.addEventListener('change', e => {
    applyTrackColor(key, e.target.value);
    document.body.removeChild(input);
  });
  input.addEventListener('cancel', () => document.body.removeChild(input));
  input.click();
}

function applyTrackColor(key, color) {
  if (!state.tracks[key]?.buffer) return;
  if (!state.trackColors) state.trackColors = {};
  state.trackColors[key] = color;
  document.querySelector(`[data-colorpick="${key}"]`).style.background = color;
  drawWaveform(key, state.tracks[key].buffer);
}

function setTrackLoading(key, loading, errorMsg) {
  const el = document.querySelector(`[data-loading="${key}"]`);
  if (!el) return;

  if (loading) {
    el.style.display = 'flex';
    el.innerHTML = `<div class="mini-spinner"></div><span>Caricamento…</span>`;
  } else if (errorMsg) {
    el.style.display = 'flex';
    el.textContent = '';
    const span = document.createElement('span');
    span.style.cssText = 'color:var(--red);font-size:10px';
    span.textContent = errorMsg;
    el.appendChild(span);
  } else {
    el.style.display = 'none';
  }
}

function setupTransportInfo() {
  const filename = state.currentFile?.split('/').pop() || '—';
  transportFilename.textContent = filename;
  transportDuration.textContent = formatTime(state.duration);
  timeTotal.textContent = formatTime(state.duration);
  timeCurrent.textContent = '0:00';
}

// ── Sezioni ───────────────────────────────────────────────────────
function showSection(name) {
  document.getElementById('home-section').classList.add('hidden');
  processingSection.classList.add('hidden');
  dawSection.classList.add('hidden');

  if (name === 'home')       document.getElementById('home-section').classList.remove('hidden');
  if (name === 'processing') processingSection.classList.remove('hidden');
  if (name === 'daw') {
    dawSection.classList.remove('hidden');
    setTimeout(() => {
      TRACK_CONFIG.forEach(cfg => {
        const track = state.tracks[cfg.key];
        if (track?.buffer) drawWaveform(cfg.key, track.buffer);
      });
    }, 100);
  }
}

function resetToImport() {
  stopPlayback();
  Object.values(state.tracks).forEach(track => {
    if (track.gainNode) try { track.gainNode.disconnect(); } catch (_) {}
  });
  state.tracks = {};
  state.stemPaths = null;
  state.currentFile = null;
  state.pauseOffset = 0;
  state.renderedRate = 1;
  state.playRate = 1;
  // Velocità: slider, etichetta e valore tornano a 1x (come l'audio del prossimo brano)
  clearTimeout(spdTimer);
  cancelSpeedJobs();
  state.playbackRate = 1;
  const spd = $('master-speed');
  if (spd) spd.value = 1;
  const spdLabel = $('master-spd-label');
  if (spdLabel) spdLabel.textContent = '1.00x';
  state.duration = 0;
  tracksContainer.innerHTML = '';
  showSection('home');
  loadSessions();
}

// ── Progress Bar animata ──────────────────────────────────────────
let progressInterval = null;

function stopProgressTimer() {
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

function animateProgressBar() {
  progressBar.style.width = '0%';
  let progress = 0;

  if (progressInterval) clearInterval(progressInterval);

  progressInterval = setInterval(() => {
    // Simula progresso fino al 90% — l'ultimo 10% è per il completamento reale
    if (progress < 90) {
      progress += Math.random() * 2;
      progressBar.style.width = `${Math.min(progress, 90)}%`;
    }
  }, 800);
}

// ── Utilities ─────────────────────────────────────────────────────
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Data ISO 8601 (UTC, dal backend) -> ora locale leggibile
function formatDate(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Resize waveform on window resize ─────────────────────────────
window.addEventListener('resize', () => {
  if (Object.keys(state.tracks).length === 0) return;

  TRACK_CONFIG.forEach(cfg => {
    const track = state.tracks[cfg.key];
    if (track?.buffer) {
      // Piccolo delay per attendere il reflow
      setTimeout(() => drawWaveform(cfg.key, track.buffer), 100);
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────
function resetTracks() {
  TRACK_CONFIG.forEach(({ key }) => {
    const track = state.tracks[key];
    if (!track) return;
    track.muted = false;
    track.solo = false;
    track.volume = 1.0;
    document.querySelector(`[data-mute="${key}"]`)?.classList.remove('active');
    document.querySelector(`[data-solo="${key}"]`)?.classList.remove('active');
    document.querySelector(`[data-track="${key}"]`)?.classList.remove('muted','soloed');
    const slider = document.querySelector(`[data-volume="${key}"]`);
    if (slider) slider.value = 1;
    document.querySelector(`[data-vol-label="${key}"]`).textContent = '100%';
    applyGain(key);
  });
}

function setMasterVolume(val) {
  const ctx = getAudioContext();
  const gain = parseFloat(val);
  if (!state.masterGain) {
    state.masterGain = ctx.createGain();
    state.masterGain.connect(ctx.destination);
    Object.values(state.tracks).forEach(t => {
      t.gainNode.disconnect();
      t.gainNode.connect(state.masterGain);
    });
  }
  state.masterGain.gain.setTargetAtTime(gain, ctx.currentTime, 0.02);
  $('master-vol-label').textContent = `${Math.round(gain * 100)}%`;
}

let spdTimer;
let spdToken = 0, spdJobs = [], spdResume = false;
function cancelSpeedJobs() {
  spdToken++;
  spdJobs.forEach(j => j.cancel());
  spdJobs = [];
  spdResume = false;
}
function setMasterSpeed(val) {
  state.playbackRate = parseFloat(val);
  $('master-spd-label').textContent = `${state.playbackRate.toFixed(2)}x`;
  clearTimeout(spdTimer);
  spdTimer = setTimeout(applySpeed, 400);
}
async function applySpeed() {
  const r = state.playbackRate;
  const label = $('master-spd-label');
  const fmt = `${r.toFixed(2)}x`;
  // Annulla calcoli precedenti ancora in corso
  spdJobs.forEach(j => j.cancel());
  spdJobs = [];
  const token = ++spdToken;
  if (state.isPlaying) { spdResume = true; pausePlayback(); }

  if (r === 1) {
    Object.values(state.tracks).forEach(t => { t.stretched = null; });
    state.renderedRate = 1;
  } else {
    label.textContent = `${fmt} ...`;
    const ctx = getAudioContext();
    const entries = Object.values(state.tracks).filter(t => t.buffer);
    const jobs = entries.map(t => window._stretchAsync(t.buffer, r, ctx));
    spdJobs = jobs;
    try {
      const results = await Promise.all(jobs.map(j => j.promise));
      if (token !== spdToken) return; // superato da una richiesta più recente
      entries.forEach((t, i) => { t.stretched = results[i]; });
      state.renderedRate = r;
    } catch (err) {
      if (token !== spdToken) return;
      console.error('Errore velocità:', err);
      state.renderedRate = 1;
    }
    spdJobs = [];
    label.textContent = fmt;
  }
  if (spdResume) { spdResume = false; startPlayback(); }
}
init();
