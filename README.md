# StemSplitter

App DAW leggera per macOS che separa un file audio in 4 tracce (Voce, Batteria, Basso, Altro) tramite **demucs-mlx**, con waveform interattive e controlli per traccia.

Costruita con **Tauri 1.x** (Rust + HTML/CSS/JS nativo) — nessun Electron.

---

## Funzionalità

- **Separazione automatica** in 4 stem: Voce, Batteria, Basso, Altro
- **Waveform interattive** per ogni traccia con seek via click
- **Mute / Solo** per traccia
- **Volume individuale** per traccia (0–150%)
- **Volume master** e **velocità di riproduzione** (0.5x–2x)
- **Reset** rapido di tutti i controlli al valore di default
- **Colore waveform personalizzabile** per traccia (valido solo finché l'app è aperta)
- **Libreria brani** — lista dei brani già separati con durata e data
- **Cartella libreria configurabile** e persistente tra sessioni
- Output in **MP3** (conversione automatica via ffmpeg dopo la separazione)

---

## Prerequisiti

```bash
# 1. Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 2. demucs-mlx (versione ottimizzata per Apple Silicon)
pip install demucs-mlx

# 3. ffmpeg
brew install ffmpeg

# 4. Node.js (per il bundle delle API Tauri e la CLI Tauri)
# https://nodejs.org

# 5. Strumenti Xcode
xcode-select --install
```

---

## Avvio

```bash
cd stemsplitter

# Installa le dipendenze npm e genera il bundle API Tauri
npm install
node_modules/.bin/esbuild src/main.js --bundle --outfile=src/bundle.js

# Avvia in modalità sviluppo
npx tauri dev
```

---

## Build distribuzione

```bash
npx tauri build
```

Genera `.app` e `.dmg` in `src-tauri/target/release/bundle/`.

Per aggiornare le icone:
```bash
npx tauri icon path/to/icon.png
```

---

## Struttura del progetto

```
stemsplitter/
├── src/
│   ├── index.html        # Struttura UI
│   ├── style.css         # Tema dark stile DAW
│   ├── app.js            # Logica: Web Audio API, waveform, playback
│   ├── main.js           # Entry point per il bundle Tauri API
│   └── bundle.js         # Bundle generato da esbuild (committato: serve al build)
│
├── src-tauri/
│   ├── src/main.rs       # Backend Rust: comandi Tauri, demucs-mlx, ffmpeg
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
│
├── package.json
├── setup.sh
└── README.md
```

---

## Come funziona

1. **Home** — trascina un file audio o aprilo con il file picker
2. **Conferma cartella** — scegli dove salvare i file separati (default: `~/Downloads/StemSplitter/`)
3. **Separazione** — demucs-mlx elabora il file con il modello `htdemucs` (ottimizzato Apple Silicon)
4. **Conversione** — ffmpeg converte i wav in mp3 e rimuove i file originali
5. **DAW** — ascolta e controlla le 4 tracce separate

I brani già separati appaiono nella libreria home e possono essere riaperti senza rielaborarli.

### Configurazione persistente

La cartella libreria viene salvata in:
```
~/Library/Application Support/StemSplitter/config.json
```

---

## Troubleshooting

**demucs-mlx non trovato**
L'app cerca il binario in diversi path comuni (conda, homebrew, pip). Se non lo trova:
```bash
which demucs-mlx
# Se è in un environment conda, avvia l'app dallo stesso terminale con conda attivo
```

**Le waveform non appaiono**
Aprire i DevTools con `Cmd+Option+I` forza il reflow del layout — comportamento noto, non causa problemi in uso normale.

**bundle.js mancante**
```bash
node_modules/.bin/esbuild src/main.js --bundle --outfile=src/bundle.js
```
