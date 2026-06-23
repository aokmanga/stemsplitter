#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  StemSplitter — setup.sh
#  Installa le dipendenze e avvia l'app in modalità dev
# ═══════════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║        StemSplitter Setup            ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Controlla Rust ────────────────────────────────────────────────
if ! command -v rustc &>/dev/null; then
  echo "❌  Rust non trovato. Installalo con:"
  echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  exit 1
fi
echo "✅  Rust $(rustc --version)"

# ── Controlla Node.js (opzionale per tauri-cli via npm) ───────────
if ! command -v node &>/dev/null; then
  echo "⚠️   Node.js non trovato. Verrà usato cargo-tauri direttamente."
  USE_NPM=false
else
  echo "✅  Node.js $(node --version)"
  USE_NPM=true
fi

# ── Controlla demucs ─────────────────────────────────────────────
if command -v demucs &>/dev/null; then
  echo "✅  demucs $(demucs --version 2>/dev/null || echo 'trovato')"
elif python3 -m demucs --version &>/dev/null 2>&1; then
  echo "✅  demucs (via python3 -m demucs)"
else
  echo "⚠️   demucs non trovato. Installalo con:"
  echo "    pip install demucs"
  echo "    (Continuo comunque...)"
fi

# ── Controlla ffmpeg ─────────────────────────────────────────────
if command -v ffmpeg &>/dev/null; then
  echo "✅  ffmpeg trovato"
else
  echo "⚠️   ffmpeg non trovato. Installalo con:"
  echo "    brew install ffmpeg"
fi

echo ""
echo "── Installazione tauri-cli ──────────────────────────────────"

if [ "$USE_NPM" = true ]; then
  npm install
  echo "✅  Dipendenze npm installate"
else
  cargo install tauri-cli --version "^1.6" 2>/dev/null || echo "tauri-cli già installato"
fi

echo ""
echo "── Icone placeholder (crea le tue in src-tauri/icons/) ──────"
mkdir -p src-tauri/icons
# Genera icona placeholder se non esiste
if [ ! -f src-tauri/icons/icon.icns ]; then
  echo "⚠️   Icone non trovate. Per un'app distribuibile, genera le icone con:"
  echo "    cargo tauri icon path/to/icon.png"
  # Crea file vuoti per non bloccare il build
  touch src-tauri/icons/icon.icns
  touch src-tauri/icons/icon.ico
  for size in "32x32" "128x128" "128x128@2x"; do
    touch "src-tauri/icons/${size}.png"
  done
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Avvio StemSplitter in Dev        ║"
echo "╚══════════════════════════════════════╝"
echo ""

if [ "$USE_NPM" = true ]; then
  npm run dev
else
  cargo tauri dev
fi
