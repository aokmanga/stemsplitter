/* ═══════════════════════════════════════════════════════════════════
   StemSplitter — chords.js
   Griglia accordi mobile (stile Chordify): quadrati per battuta che scorrono
   col brano. Usa i dati di scripts/analyze_chords.py (chords.json nella sessione).
   Nessuna modifica ad app.js: legge lo stato globale (state, invoke, $, currentPos).
═══════════════════════════════════════════════════════════════════ */
(function () {
  const SQ = 46; // larghezza di un quadrato in px (deve combaciare con style.css)
  const ROOT_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const ROOT_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const IT_SHARP   = ['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];
  const IT_FLAT    = ['Do','Reb','Re','Mib','Mi','Fa','Solb','Sol','Lab','La','Sib','Si'];
  const SUFFIX = { maj: '', min: 'm', '7': '7', maj7: 'maj7', min7: 'm7' };
  const FLAT_MAJ = new Set([5, 10, 3, 8, 1, 6]);   // F Bb Eb Ab Db Gb
  const FLAT_MIN = new Set([2, 7, 0, 5, 10, 3]);   // Dm Gm Cm Fm Bbm Ebm

  let data = null;          // { beats, chords, bpb, offset, engine }
  let loadedFor = null;     // cartella sessione di cui è caricato chords.json
  let notation = 'EN';      // 'EN' (C, G, Am) | 'IT' (Do, Sol, Lam)
  try { notation = localStorage.getItem('chordNotation') || 'EN'; } catch (_) {}
  let lastCur = -2, lastPitch = null, lastNotation = null, lastKey = null;
  let busy = false;

  const el = id => document.getElementById(id);

  // ── Nomi accordi (con trasposizione dello slider TON e bemolli/diesis dalla tonalità) ──
  function useFlats() {
    const k = state.key;
    if (!k) return false;
    const root = (k.root + (state.pitch || 0) + 120) % 12;
    return (k.minor ? FLAT_MIN : FLAT_MAJ).has(root);
  }
  function chordName(code) {
    if (!code || code === 'N') return '';
    const [r, q] = code.split(':');
    const root = (parseInt(r, 10) + (state.pitch || 0) + 120) % 12;
    const flats = useFlats();
    const names = notation === 'IT' ? (flats ? IT_FLAT : IT_SHARP) : (flats ? ROOT_FLAT : ROOT_SHARP);
    return names[root] + (SUFFIX[q] ?? '');
  }

  // ── Salvataggio impostazioni (bpb, offset) dentro chords.json ──
  function filePath() {
    const d = state.stemPaths?.output_dir;
    return d ? `${d}/chords.json` : null;
  }
  async function save() {
    const p = filePath();
    if (!p || !data) return;
    try { await invoke('write_text_file', { path: p, content: JSON.stringify(data) }); }
    catch (e) { console.error('Errore salvataggio accordi:', e); }
  }
  async function load() {
    data = null;
    const p = filePath();
    if (p) {
      try { data = JSON.parse(await invoke('read_text_file', { path: p })); } catch (_) { /* nessun chords.json */ }
    }
    build();
  }

  // ── Costruzione griglia ──
  function build() {
    const track = el('chord-track'), empty = el('chord-empty');
    if (!track) return;
    track.innerHTML = '';
    lastCur = -2;
    const has = !!(data && data.beats && data.beats.length);
    el('chord-controls').style.display = has ? 'flex' : 'none';
    empty.style.display = has ? 'none' : 'block';
    if (!has) return;

    const { chords, bpb, offset } = data;
    el('chord-bpb').value = String(bpb);
    el('chord-notation').value = notation;
    const frag = document.createDocumentFragment();
    // pre-roll: battiti prima del primo inizio battuta (squadrati vuoti per allineare)
    const pre = ((offset % bpb) + bpb) % bpb;
    for (let i = -((bpb - pre) % bpb); i < chords.length; i++) {
      const sq = document.createElement('div');
      sq.className = 'chord-sq';
      if (i < 0) { sq.classList.add('pad'); frag.appendChild(sq); continue; }
      sq.dataset.i = i;
      const rel = i - offset;
      const beatInBar = ((rel % bpb) + bpb) % bpb;
      if (beatInBar === 0) {
        sq.classList.add('bar-start');
        const n = document.createElement('span');
        n.className = 'bar-num';
        n.textContent = Math.floor(rel / bpb) + 1;
        sq.appendChild(n);
      }
      const changed = i === 0 || chords[i] !== chords[i - 1];
      const txt = document.createElement('span');
      txt.className = 'chord-txt';
      if (changed && chords[i] !== 'N') { txt.textContent = chordName(chords[i]); txt.dataset.code = chords[i]; }
      else if (!changed && chords[i] !== 'N') txt.classList.add('hold');
      sq.appendChild(txt);
      frag.appendChild(sq);
    }
    track.appendChild(frag);
    lastPitch = state.pitch; lastNotation = notation; lastKey = state.key;
  }

  // aggiorna solo i testi (cambio tonalità o notazione), senza ricostruire
  function relabel() {
    document.querySelectorAll('#chord-track .chord-txt[data-code]').forEach(t => {
      t.textContent = chordName(t.dataset.code);
    });
    lastPitch = state.pitch; lastNotation = notation; lastKey = state.key;
  }

  // ── Posizione corrente → indice battito frazionario (ricerca binaria) ──
  function beatPos(t) {
    const b = data.beats;
    if (t < b[0]) return -1 + Math.max(t, 0) / (b[0] || 1) - 0; // prima del primo battito
    let lo = 0, hi = b.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m] <= t) lo = m; else hi = m - 1; }
    const next = b[lo + 1] ?? (b[lo] + (b[lo] - (b[lo - 1] ?? b[lo] - 0.5)));
    return lo + Math.min(1, (t - b[lo]) / (next - b[lo]));
  }

  function frame() {
    requestAnimationFrame(frame);
    const dir = state.stemPaths?.output_dir || null;
    if (dir !== loadedFor) { loadedFor = dir; if (dir) load(); else { data = null; build(); } }
    if (!data || !state.duration) return;
    if (state.pitch !== lastPitch || notation !== lastNotation || state.key !== lastKey) relabel();

    const t = state.isPlaying ? currentPos() : state.pauseOffset;
    const pos = beatPos(t);
    const cur = Math.max(0, Math.floor(pos));
    const wrap = el('chord-strip');
    const pre = (data.bpb - (((data.offset % data.bpb) + data.bpb) % data.bpb)) % data.bpb;
    // il quadrato corrente resta a ~30% dalla sinistra; scorrimento fluido tra un battito e l'altro
    const x = (pre + Math.max(pos, 0)) * SQ;
    el('chord-track').style.transform = `translateX(${wrap.clientWidth * 0.3 - x}px)`;
    if (cur !== lastCur) {
      el('chord-track').querySelector('.chord-sq.now')?.classList.remove('now');
      el('chord-track').querySelector(`.chord-sq[data-i="${cur}"]`)?.classList.add('now');
      lastCur = cur;
      const c = data.chords[cur];
      el('chord-now').textContent = chordName(c) || '—';
    }
  }

  // ── Rilevamento ──
  async function detect() {
    const dir = state.stemPaths?.output_dir;
    const btn = el('btn-detect-chords');
    if (!dir || busy) return;
    busy = true; btn.disabled = true; btn.textContent = '⏳';
    btn.title = 'Riconoscimento accordi in corso… (1-2 minuti)';
    try {
      data = JSON.parse(await invoke('analyze_chords', { sessionDir: dir }));
      build();
    } catch (err) {
      alert(`Riconoscimento accordi non riuscito:\n${err.message || err}`);
    } finally {
      busy = false; btn.disabled = false; btn.textContent = '🎶';
      btn.title = 'Riconosci accordi';
    }
  }

  function setup() {
    const btn = el('btn-detect-chords');
    if (!btn) return;
    btn.addEventListener('click', detect);
    el('chord-bpb').addEventListener('change', e => {
      if (!data) return;
      data.bpb = parseInt(e.target.value, 10); data.offset = ((data.offset % data.bpb) + data.bpb) % data.bpb;
      build(); save();
    });
    // sposta l'inizio battuta di un movimento (utile quando il motore sbaglia il "primo tempo")
    const shift = d => { if (!data) return; data.offset = (((data.offset + d) % data.bpb) + data.bpb) % data.bpb; build(); save(); };
    el('chord-shift-l').addEventListener('click', () => shift(-1));
    el('chord-shift-r').addEventListener('click', () => shift(1));
    el('chord-notation').addEventListener('change', e => {
      notation = e.target.value;
      try { localStorage.setItem('chordNotation', notation); } catch (_) {}
      relabel();
    });
    // clic su un quadrato = vai a quel battito
    el('chord-track').addEventListener('click', e => {
      const sq = e.target.closest('.chord-sq[data-i]');
      if (sq && data) seekToSeconds(data.beats[parseInt(sq.dataset.i, 10)]);
    });
    requestAnimationFrame(frame);
  }
  setup();
})();
