import { SoundTouch, SimpleFilter } from 'soundtouchjs';

// Sorgente audio per SoundTouch: legge L/R e li restituisce interleaved
class ArraySource {
  constructor(L, R) { this.L = L; this.R = R; }
  extract(target, numFrames = 0, position = 0) {
    const n = Math.max(0, Math.min(numFrames, this.L.length - position));
    for (let i = 0; i < n; i++) {
      target[2 * i] = this.L[position + i];
      target[2 * i + 1] = this.R[position + i];
    }
    return n;
  }
}

self.onmessage = (e) => {
  const { L, R, tempo, pitch } = e.data;
  const st = new SoundTouch();
  st.tempo = tempo;
  st.pitchSemitones = pitch || 0;
  const f = new SimpleFilter(new ArraySource(L, R), st);
  const len = Math.ceil(L.length / tempo) + 16384;
  const outL = new Float32Array(len), outR = new Float32Array(len);
  const tmp = new Float32Array(16384);
  let pos = 0, got;
  while (pos < len - 8192 && (got = f.extract(tmp, 8192)) > 0) {
    for (let i = 0; i < got; i++) { outL[pos + i] = tmp[2 * i]; outR[pos + i] = tmp[2 * i + 1]; }
    pos += got;
  }
  self.postMessage({ L: outL, R: outR, len }, [outL.buffer, outR.buffer]);
};
