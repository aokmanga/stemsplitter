# DECISIONS — StemSplitter

Formato: decisione → motivo → conseguenza. Aggiungere in fondo, non riscrivere.

| # | Decisione | Motivo | Conseguenza |
|---|---|---|---|
| 1 | Tauri **1.x**, non v2 | Il progetto è nato in v1; la CLI `cargo tauri` è v2 e dà errori di config | Usare `npx tauri`. `package.json` ha ancora script `dev/build` con `cargo tauri` (da non usare) |
| 2 | Frontend in JS puro, no framework | Utente senza background di programmazione, app piccola | `app.js` è uno script unico, stato globale in `state` |
| 3 | `main.js` + esbuild → `bundle.js` | In Tauri 1 le API sono npm, `app.js` non è un modulo | Esposte su `window._*`. Rigenerare il bundle a ogni modifica |
| 4 | `demucs-mlx` (non demucs classico) | Ottimizzato per Apple Silicon (M1) | Percorso cercato in vari punti (conda, homebrew, pip) in `find_demucs_path` |
| 5 | Modello `htdemucs`, 4 stem | Standard, bastano voce/batteria/basso/altro | Il parametro `model` arriva a Rust ma non viene usato |
| 6 | Output **MP3** (ffmpeg, `-q:a 2`), wav cancellati | Risparmio spazio su disco | Perdita minima di qualità; la libreria cerca solo `.mp3` |
| 7 | Libreria = cartella su disco (`~/Downloads/StemSplitter/`) | Niente database, riaprire un brano = rileggere la cartella | Sessione valida solo con `vocals.mp3` + `drums.mp3` |
| 8 | Config in `~/Library/Application Support/StemSplitter/config.json` | Persiste tra sessioni | Oggi contiene solo `library_path` |
| 9 | File letti come base64 via `read_audio_file` | Più semplice che esporre il filesystem alla WebView | Lento/pesante su file grandi (+33% memoria) |
| 10 | Picker file/cartella asincroni con eventi | In Tauri 1 il dialog usa callback | Il risultato arriva via `file-selected` / `dir-selected` |
| 11 | Drag&drop con evento nativo `tauri://file-drop` | Nella WebView il drop non espone `file.path` | `fileDropEnabled: true` in `tauri.conf.json` |
| 12 | Velocità con **soundtouchjs** (time-stretch) | `playbackRate` cambiava l'intonazione | Buffer ricalcolati a ogni cambio (400 ms di debounce) |
| 13 | Posizione sempre in tempo originale | Evita errori al cambio velocità | `start(0, offset/rate)`; tempo trascorso × `playRate` |
| 14 | Worker per lo stretch: **applicato** | UI bloccata ~1,3 s/stem a ogni cambio velocità | Servono 2 bundle (`bundle.js` + `worker-bundle.js`) |
| 15 | Icone committate (non in `.gitignore`) | Servono per il build su altri Mac | Rigenerare con `npx tauri icon ~/Desktop/icona.png` |
| 16 | Barra di avanzamento simulata | demucs-mlx non espone una % facile da leggere | Sale fino al 90% a caso, poi 100% a fine lavoro |
| 17 | Modifiche richieste in forma before/after, risposte brevi | Preferenza di Simone | Vale per ogni risposta in questo progetto |
| 18 | Un worker per stem, in parallelo | Più veloce di un worker solo | Annullo = `terminate()` dei worker; token `spdToken` scarta risultati superati |
| 19 | Secondo motore: BS-Roformer SW (6 stem) con `mlx-audio-separator`, scelto a ogni separazione con due pulsanti nel modal | Qualità e 6 stem (chitarra, piano); stessa famiglia MLX di demucs-mlx; scelta non memorizzata, più semplice | `run_demucs` riceve `engine` (`demucs` o `roformer`). Roformer scrive già MP3: niente passaggio ffmpeg, file rinominati in `vocals.mp3` ecc. ~3,5 min per un brano di 5 min su M1 |
| 20 | Chitarra e piano opzionali | Demucs dà 4 stem, Roformer 6 | Esistono solo se `guitar.mp3`/`piano.mp3` sono nella cartella; le sessioni valide restano quelle con `vocals.mp3` + `drums.mp3` |
