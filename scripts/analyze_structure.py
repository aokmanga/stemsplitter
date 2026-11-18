#!/usr/bin/env python3
"""StemSplitter — analisi struttura del brano.

Uso: analyze_structure.py --session <cartella sessione> --ffmpeg <path> --work <cartella temp>
Legge gli stem (vocals/drums/bass/other[/guitar/piano].mp3), scrive <sessione>/analysis.json
e lo stampa su stdout. Motore: All-In-One (allin1) se installato, altrimenti librosa.
Output: {engine, bpm, beats, downbeats, segments:[{start,end,label}]}
Etichette: intro, verse, chorus, bridge, solo, inst, outro, break
"""
import argparse, json, os, subprocess, sys

STEMS = ["vocals", "drums", "bass", "other", "guitar", "piano"]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def ff(ffmpeg, args):
    subprocess.run([ffmpeg, "-y", "-loglevel", "error"] + args, check=True)


def mix(ffmpeg, inputs, out):
    if len(inputs) == 1:
        ff(ffmpeg, ["-i", inputs[0], "-ar", "44100", "-ac", "2", out])
        return
    args = []
    for p in inputs:
        args += ["-i", p]
    n = len(inputs)
    # amix divide ogni ingresso per n: volume=n ripristina la somma
    ff(ffmpeg, args + ["-filter_complex", f"amix=inputs={n}:duration=longest,volume={n}",
                       "-ar", "44100", "-ac", "2", out])


def prepare(session, ffmpeg, work):
    """Crea mix.wav e la struttura demix/htdemucs/mix/{vocals,drums,bass,other}.wav"""
    found = {s: os.path.join(session, s + ".mp3") for s in STEMS}
    found = {s: p for s, p in found.items() if os.path.exists(p)}
    if not found:
        raise RuntimeError("Nessuno stem trovato nella sessione")
    dm = os.path.join(work, "demix", "htdemucs", "mix")
    os.makedirs(dm, exist_ok=True)
    mix_wav = os.path.join(work, "mix.wav")
    mix(ffmpeg, list(found.values()), mix_wav)
    for s in ("vocals", "drums", "bass"):
        if s in found:
            mix(ffmpeg, [found[s]], os.path.join(dm, s + ".wav"))
        else:  # allin1 vuole tutti e 4: silenzio al posto dello stem mancante
            ff(ffmpeg, ["-i", mix_wav, "-af", "volume=0", os.path.join(dm, s + ".wav")])
    other = [found[s] for s in ("other", "guitar", "piano") if s in found]
    if other:
        mix(ffmpeg, other, os.path.join(dm, "other.wav"))
    else:
        ff(ffmpeg, ["-i", mix_wav, "-af", "volume=0", os.path.join(dm, "other.wav")])
    return mix_wav


def run_allin1(mix_wav, work):
    import allin1
    log("Motore: All-In-One")
    r = allin1.analyze(mix_wav, demix_dir=os.path.join(work, "demix"),
                       spec_dir=os.path.join(work, "spec"), device="cpu",
                       keep_byproducts=True)
    segs = [{"start": float(s.start), "end": float(s.end), "label": s.label}
            for s in r.segments if s.label not in ("start", "end")]
    return {"engine": "allin1", "bpm": float(r.bpm) if r.bpm else None,
            "beats": [float(b) for b in r.beats],
            "downbeats": [float(b) for b in r.downbeats], "segments": segs}


def run_librosa(mix_wav):
    import numpy as np, librosa
    from sklearn.cluster import AgglomerativeClustering
    log("Motore: librosa (meno preciso)")
    y, sr = librosa.load(mix_wav, sr=22050, mono=True)
    dur = len(y) / sr
    hop = 512
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units="time")
    tempo = float(np.atleast_1d(tempo)[0])
    bf = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13)
    rms = librosa.feature.rms(y=y, hop_length=hop)
    feats = np.vstack([librosa.util.sync(chroma, bf), librosa.util.sync(mfcc, bf)])
    energy = librosa.util.sync(rms, bf)[0]
    times = np.concatenate([[0.0], beats])
    k = int(min(max(round(dur / 22), 4), 12))
    k = min(k, feats.shape[1] - 1)
    idx = librosa.segment.agglomerative(feats, k)
    idx = sorted(set(int(i) for i in idx) | {0})
    bounds = idx + [feats.shape[1]]
    seg_f, seg_e, seg_t = [], [], []
    for a, b in zip(bounds[:-1], bounds[1:]):
        seg_f.append(feats[:, a:b].mean(axis=1))
        seg_e.append(float(energy[a:b].mean()))
        t0 = float(times[min(a, len(times) - 1)])
        t1 = float(times[min(b, len(times) - 1)]) if b < len(times) else dur
        seg_t.append((t0, t1))
    n = len(seg_t)
    m = max(2, min(5, round(n / 2)))
    X = np.array(seg_f)
    try:
        cl = AgglomerativeClustering(n_clusters=m, metric="cosine", linkage="average").fit_predict(X)
    except TypeError:
        cl = AgglomerativeClustering(n_clusters=m, affinity="cosine", linkage="average").fit_predict(X)
    stats = {}
    for c in set(cl):
        ids = [i for i in range(n) if cl[i] == c]
        stats[c] = (len(ids), float(np.mean([seg_e[i] for i in ids])))
    rep = [c for c in stats if stats[c][0] >= 2]
    chorus = max(rep, key=lambda c: stats[c][1]) if rep else None
    verse = None
    cand = [c for c in rep if c != chorus]
    if cand:
        verse = max(cand, key=lambda c: stats[c][0])
    labels = []
    for i in range(n):
        c = cl[i]
        dur_i = seg_t[i][1] - seg_t[i][0]
        if c == chorus: lab = "chorus"
        elif c == verse: lab = "verse"
        elif stats[c][0] == 1 and i == 0 and dur_i < 25: lab = "intro"
        elif stats[c][0] == 1 and i == n - 1 and dur_i < 25: lab = "outro"
        elif stats[c][0] == 1: lab = "bridge"
        else: lab = "verse"
        labels.append(lab)
    segs = []
    for (t0, t1), lab in zip(seg_t, labels):
        if segs and (t1 - t0 < 8 or segs[-1]["label"] == lab):  # unisce pezzi troppo corti o uguali
            segs[-1]["end"] = t1
        else:
            segs.append({"start": t0, "end": t1, "label": lab})
    return {"engine": "librosa", "bpm": tempo, "beats": [float(b) for b in beats],
            "downbeats": [], "segments": segs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--ffmpeg", required=True)
    ap.add_argument("--work", required=True)
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    mix_wav = prepare(a.session, a.ffmpeg, a.work)
    result = None
    try:
        import allin1  # noqa: F401
        result = run_allin1(mix_wav, a.work)
    except ImportError:
        log("allin1 non installato: uso il ripiego librosa")
    except Exception as e:  # allin1 presente ma fallito
        log(f"allin1 fallito ({e}): uso il ripiego librosa")
    if result is None:
        try:
            result = run_librosa(mix_wav)
        except ImportError:
            print("Manca librosa: installa con  python3 -m pip install librosa scikit-learn", file=sys.stderr)
            sys.exit(2)
    out = json.dumps(result, ensure_ascii=False)
    with open(os.path.join(a.session, "analysis.json"), "w") as f:
        f.write(out)
    print(out)


if __name__ == "__main__":
    main()
