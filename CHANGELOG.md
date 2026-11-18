# CHANGELOG — StemSplitter

Più recente in alto. Una riga per modifica.

## Non rilasciato
- Nuovo motore BS-Roformer SW (6 stem) via `mlx-audio-separator`, scelto con due pulsanti nel modal dopo la scelta del file (Demucs 4 stem / BS-Roformer SW 6 stem). Testato (`5b9276a`).
- Tracce chitarra e pianoforte: lette solo se `guitar.mp3` e `piano.mp3` esistono nella cartella della sessione. Testato (`5b9276a`).
- Testo del modello nella schermata di elaborazione ora dinamico (mostra il motore scelto) (`5b9276a`).
- Velocità in Web Worker (`01fc83c`): UI fluida, un worker per stem in parallelo, calcoli superati annullati, etichetta `1.25x ...` durante il calcolo, play ripreso a fine calcolo. Testato.
- Corretti 13 bug (testati, ok; commit `bacffe4`): errore demucs → torna alla home; reset velocità al cambio brano; riproduzione sicura se manca un buffer stirato; date libreria corrette (ora locale); ffmpeg/ffprobe cercati in più percorsi; wav cancellato solo se l'mp3 è stato creato; progresso reale (%) da demucs senza bloccare l'app; README e `package.json` allineati a `npx tauri`; parametro `model` rimosso; nomi brano inseriti come testo (no HTML); CSP attiva e scope fs ridotto; stem mancante gestito senza errori.
- Migliorie rimandate (cache, loop A-B, ecc.) in `TODO.md`.

## 0.1.0 (stato attuale, commit `68be0a0`)
- Aggiornamento generico (commit `68be0a0`).
- Aggiunta icona app (`6509e75`).
- Velocità senza cambio di intonazione con `soundtouchjs` (`5751f6e`).
- README aggiornato (`dc52bc6`).
- `.gitignore` aggiunto, `node_modules` tolto dal tracking (`ae9bd5b`).
- Primo commit: separazione 4 stem, vista DAW (mute/solo/volume/waveform/seek), libreria brani, cartella configurabile, output MP3 (`e0981e0`).

## Come aggiornare
1. Per ogni modifica: una riga sotto "Non rilasciato" con hash commit.
2. Quando Simone fa `git commit`, spostare le righe sotto il nuovo numero di versione.
