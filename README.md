# StemSplitter

App DAW leggera per macOS che separa un file audio in 4 tracce (Voce, Batteria, Basso, Altro) tramite **Demucs**, con waveform interattive, mute/solo e controllo volume per traccia.

Costruita con **Tauri** (Rust + HTML/CSS/JS nativo), nessun Electron.

---

## Prerequisiti

Assicurati di avere tutto installato:

```bash
# 1. Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 2. Tauri CLI (scegli uno dei due)
cargo install tauri-cli --version "^1.6"
# oppure con npm: npm install -g @tauri-apps/cli

# 3. demucs (se non già installato)
pip install demucs

# 4. ffmpeg (per leggere qualsiasi formato)
brew install ffmpeg

# 5. Dipendenze macOS per Tauri
xcode-select --install
```

---

## Avvio rapido

```bash
cd stemsplitter

# Con lo script (consigliato)
./setup.sh

# Oppure manualmente
cargo tauri dev
```

L'app si aprirà come finestra nativa macOS.

---

## Build per distribuzione

```bash
cargo tauri build
```

Genera un `.dmg` e un `.app` in `src-tauri/target/release/bundle/`.

Per generare le icone dall'immagine della tua app:

```bash
cargo tauri icon path/to/icon.png   # genera tutte le dimensioni
```

---

## Struttura del progetto

```
stemsplitter/
├── src/                    # Frontend (HTML + CSS + JS)
│   ├── index.html          # Struttura UI
│   ├── style.css           # Tema dark stile DAW
│   └── app.js              # Logica: Web Audio API, waveform, playback
│
├── src-tauri/              # Backend Rust (Tauri)
│   ├── src/main.rs         # Comandi Tauri: pick file, run demucs, leggi audio
│   ├── Cargo.toml          # Dipendenze Rust
│   ├── tauri.conf.json     # Configurazione app (nome, finestra, permessi)
│   └── icons/              # Icone app
│
├── package.json            # Dipendenze npm (opzionale)
├── setup.sh                # Script di setup e avvio
└── README.md
```

---

## Come funziona

1. **Importa** un file audio (trascina o apri)
2. **Scegli** la cartella di output (default: stessa del file)
3. **Demucs** elabora il file e crea 4 stem in `output_dir/htdemucs/nome_file/`
4. Le **waveform** vengono disegnate con Web Audio API + Canvas
5. Controlla ogni traccia con:
   - **M** — Mute (silenzia)
   - **S** — Solo (ascolta solo questa)
   - **Slider VOL** — Volume 0–150%
   - **Click sulla waveform** — Seek alla posizione

---

## Formato output

Demucs salva le stem come file `.wav` (o `.mp3` se specificato) in:

```
output_dir/
└── htdemucs/
    └── nome_file/
        ├── vocals.wav
        ├── drums.wav
        ├── bass.wav
        └── other.wav
```

---

## Troubleshooting

**demucs non trovato**
```bash
# Controlla dove è installato
which demucs
pip show demucs

# Se installato in un venv o con conda, avvia l'app dallo stesso ambiente
```

**L'app non trova demucs**
L'app cerca demucs in: PATH, `/usr/local/bin`, `/opt/homebrew/bin`, `~/Library/Python/3.11/bin`, `~/.local/bin`. Se è altrove, crea un symlink:
```bash
ln -s $(which demucs) /usr/local/bin/demucs
```

**Errore "no audio worklet"**
Riavvia l'app — il contesto audio si inizializza al primo play.
