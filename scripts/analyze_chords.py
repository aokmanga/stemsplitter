#!/usr/bin/env python3
"""StemSplitter — riconoscimento accordi (uno per battuta-movimento).

Uso: analyze_chords.py --session <cartella sessione> --ffmpeg <path> --work <cartella temp>
Legge gli stem (other/guitar/piano/bass per l'armonia, drums+bass per le battute se manca
analysis.json), scrive <sessione>/chords.json e lo stampa su stdout.
Output: {engine, beats:[sec], chords:["9:min" | "N" per ogni battito], bpb, offset}
  - chords[i] è l'accordo che inizia al battito beats[i]; formato "<radice 0-11>:<qualità>"
  - qualità: maj, min, 7, maj7, min7; "N" = nessun accordo
  - bpb = movimenti per battuta (4 di default, ricavato dai downbeat se disponibili)
  - offset = indice del battito che apre la prima battuta
Motore: librosa (chroma CQT + template + Viterbi).
"""
import argparse, json, os, subprocess, sys

HARM = ["other", "guitar", "piano", "bass"]
RHY = ["drums", "bass"]
QUAL = {"maj": [0, 4, 7], "min": [0, 3, 7], "7": [0, 4, 7, 10],
        "maj7": [0, 4, 7, 11], "min7": [0, 3, 7, 10]}
PENALTY = {"maj": 0.0, "min": 0.0, "7": 0.04, "maj7": 0.05, "min7": 0.05}
SELF_P = 0.5  # probabilità di restare sullo stesso accordo al battito dopo
TEMP = 16

def log(*a):
    print(*a, file=sys.stderr, flush=True)


def ff(ffmpeg, args):
    subprocess.run([ffmpeg, "-y", "-loglevel", "error"] + args, check=True)


def mix(ffmpeg, inputs, out):
    args = []
    for p in inputs:
        args += ["-i", p]
    n = len(inputs)
    if n == 1:
        ff(ffmpeg, args + ["-ar", "22050", "-ac", "1", out])
    else:  # amix divide per n: volume=n ripristina la somma
        ff(ffmpeg, args + ["-filter_complex", f"amix=inputs={n}:duration=longest,volume={n}",
                           "-ar", "22050", "-ac", "1", out])


def stems(session, names):
    return [p for p in (os.path.join(session, s + ".mp3") for s in names) if os.path.exists(p)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--ffmpeg", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--self-p", type=float, default=SELF_P)
    ap.add_argument("--temp", type=float, default=TEMP)
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--smooth", type=int, default=4)
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    try:
        import numpy as np, librosa
    except ImportError:
        print("Manca librosa: installa con  python3 -m pip install librosa scikit-learn", file=sys.stderr)
        sys.exit(2)

    harm = stems(a.session, HARM)
    if not harm:
        raise RuntimeError("Nessuno stem armonico trovato nella sessione")
    harm_wav = os.path.join(a.work, "harm.wav")
    mix(a.ffmpeg, harm, harm_wav)
    y, sr = librosa.load(harm_wav, sr=22050, mono=True)

    # ── battiti e downbeat: da analysis.json se c'è, altrimenti li calcolo ──
    beats, downbeats = None, []
    ap_json = os.path.join(a.session, "analysis.json")
    if os.path.exists(ap_json):
        try:
            an = json.load(open(ap_json))
            if len(an.get("beats", [])) > 8:
                beats, downbeats = [float(b) for b in an["beats"]], [float(b) for b in an.get("downbeats", [])]
                log("Battiti da analysis.json")
        except Exception:
            beats = None
    if beats is None:
        rhy = stems(a.session, RHY)
        if rhy:
            rwav = os.path.join(a.work, "rhy.wav")
            mix(a.ffmpeg, rhy, rwav)
            yr, _ = librosa.load(rwav, sr=22050, mono=True)
        else:
            yr = y
        _, bt = librosa.beat.beat_track(y=yr, sr=sr, units="time")
        beats = [float(b) for b in bt]
        log("Battiti calcolati con librosa")
    if len(beats) < 8:
        raise RuntimeError("Battiti non rilevati: brano troppo breve o senza ritmo chiaro")

    # ── chroma (armonico) sincronizzato sui battiti ──
    hop = 1024
    yh = librosa.effects.harmonic(y, margin=4)
    chroma = librosa.feature.chroma_cqt(y=yh, sr=sr, hop_length=hop, norm=None)
    bass_p = stems(a.session, ["bass"])
    if bass_p:
        bwav = os.path.join(a.work, "bass.wav")
        mix(a.ffmpeg, bass_p, bwav)
        yb, _ = librosa.load(bwav, sr=22050, mono=True)
        bchroma = librosa.feature.chroma_cqt(y=yb, sr=sr, hop_length=hop, norm=None,
                                             fmin=librosa.note_to_hz("C1"), n_octaves=4)
    else:
        bchroma = np.zeros_like(chroma)
    T = chroma.shape[1]
    bf = np.clip(librosa.time_to_frames(beats, sr=sr, hop_length=hop), 0, T - 1)
    # segmento i = [bf[i], bf[i+1]) ; l'ultimo arriva a fine brano
    sync = lambda m: librosa.util.sync(m, bf, aggregate=np.mean, pad=True)[:, 1:]
    C, B = sync(chroma), sync(bchroma)
    n = C.shape[1]
    # arpeggi: nei battiti con ≤2 note forti uso la media dei battiti vicini
    if a.smooth > 1:
        from scipy.ndimage import uniform_filter1d
        sparse = (C > 0.35 * C.max(axis=0, keepdims=True)).sum(axis=0) <= 2
        C = np.where(sparse[None, :], uniform_filter1d(C, size=a.smooth, axis=1, mode="nearest"), C)
        B = np.where(sparse[None, :], uniform_filter1d(B, size=a.smooth, axis=1, mode="nearest"), B)
    energy = C.sum(axis=0)
    Cn = C / (np.linalg.norm(C, axis=0, keepdims=True) + 1e-9)
    Bn = B / (B.max(axis=0, keepdims=True) + 1e-9)

    # ── template accordi ──
    names, tmpl, roots = [], [], []
    for r in range(12):
        for q, iv in QUAL.items():
            t = np.zeros(12)
            for k, i in enumerate(iv):
                t[(r + i) % 12] = 1.3 if k == 0 else 1.0
            names.append(f"{r}:{q}"); roots.append(r)
            tmpl.append(t / np.linalg.norm(t))
    tmpl = np.array(tmpl)                                   # (60, 12)
    pen = np.array([PENALTY[nm.split(":")[1]] for nm in names])
    emis = tmpl @ Cn - pen[:, None] + 0.25 * Bn[roots, :]   # (60, n)
    quiet = energy < 0.08 * np.median(energy)
    S = len(names) + 1                                      # +1 = "N"
    obs = np.vstack([emis, np.where(quiet, 1.5, 0.3)[None, :]])
    prob = np.exp(a.temp * (obs - obs.max(axis=0, keepdims=True)))
    prob /= prob.sum(axis=0, keepdims=True)
    trans = np.full((S, S), (1 - a.self_p) / (S - 1))
    np.fill_diagonal(trans, a.self_p)
    path = librosa.sequence.viterbi(prob, trans)
    if a.debug:
        nm = lambda k: names[k] if k < len(names) else "N"
        raw = obs.argmax(axis=0)
        with open(os.path.join(a.session, "chords_debug.txt"), "w") as f:
            for i in range(n):
                f.write(f"{i:4d} {beats[i]:7.2f} {nm(raw[i]):8s} viterbi={nm(path[i])}\n")
    chords = [names[i] if i < len(names) else "N" for i in path]

    # ── movimenti per battuta e primo battito di battuta ──
    bpb, offset = 4, 0
    if len(downbeats) >= 3:
        bt = np.array(beats)
        idx = [int(np.argmin(np.abs(bt - d))) for d in downbeats]
        gaps = np.diff(idx)
        gaps = gaps[(gaps >= 2) & (gaps <= 12)]
        if len(gaps):
            bpb = int(np.bincount(gaps).argmax())
            offset = idx[0] % bpb
    else:  # senza downbeat: scelgo il primo battito di battuta dove cadono più cambi d'accordo
        ch = [i for i in range(1, len(chords)) if chords[i] != chords[i - 1]]
        if ch:
            offset = int(np.argmax([sum(1 for i in ch if (i - o) % bpb == 0) for o in range(bpb)]))
    out = {"engine": "librosa", "beats": [round(b, 3) for b in beats], "chords": chords,
           "bpb": bpb, "offset": offset}
    txt = json.dumps(out, ensure_ascii=False)
    with open(os.path.join(a.session, "chords.json"), "w") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
