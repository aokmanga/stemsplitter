/* YouTube → mp3 (yt-dlp) → separazione. Usa i globali di app.js: invoke, $, handleFileSelected, showSection, resetToImport. */
(function () {
  const urlIn = $('yt-url'), status = $('yt-status');
  const modal = $('yt-modal'), artist = $('yt-artist'), title = $('yt-title'), confirmBtn = $('btn-yt-confirm');
  let busy = false;

  const setStatus = t => { status.textContent = t; };
  const errText = e => String((e && e.message) || e);

  async function showVersion() {
    try { setStatus('yt-dlp ' + await invoke('yt_dlp_version')); }
    catch (e) { setStatus(errText(e)); }
  }

  $('btn-yt-update').addEventListener('click', async () => {
    const b = $('btn-yt-update');
    b.disabled = true; setStatus('Aggiornamento in corso…');
    try { setStatus(await invoke('update_yt_dlp')); }
    catch (e) { setStatus(errText(e)); }
    b.disabled = false;
  });

  function validName() { return artist.value.trim() || title.value.trim(); }
  function refreshConfirm() { confirmBtn.disabled = !validName(); }
  artist.addEventListener('input', refreshConfirm);
  title.addEventListener('input', refreshConfirm);
  [artist, title].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && validName()) confirmBtn.click();
    if (e.key === 'Escape') $('btn-yt-cancel').click();
  }));

  $('btn-yt-go').addEventListener('click', () => {
    if (busy) return;
    const u = urlIn.value.trim();
    if (!/^https?:\/\//i.test(u)) { setStatus('Incolla un link valido (https://…)'); return; }
    artist.value = ''; title.value = ''; refreshConfirm();
    modal.classList.remove('hidden'); artist.focus();
  });

  $('btn-yt-cancel').addEventListener('click', () => modal.classList.add('hidden'));

  confirmBtn.addEventListener('click', async () => {
    if (!validName() || busy) return;
    const name = [artist.value.trim(), title.value.trim()].filter(Boolean).join(' - ');
    const u = urlIn.value.trim();
    modal.classList.add('hidden');
    busy = true;
    showSection('processing');
    $('processing-title').textContent = 'Download da YouTube…';
    $('processing-hint').innerHTML = 'Scarico l’audio con <strong>yt-dlp</strong>.';
    animateProgressBar();
    try {
      const path = await invoke('download_youtube', { url: u, name });
      stopProgressTimer();
      resetToImport();
      urlIn.value = '';
      handleFileSelected(path);   // apre la scelta cartella + motore (Demucs / BS-Roformer)
    } catch (e) {
      stopProgressTimer();
      alert('Errore nel download:\n' + errText(e));
      resetToImport();
    }
    busy = false;
  });

  showVersion();
})();
