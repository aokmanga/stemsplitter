import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { appWindow } from '@tauri-apps/api/window';
window._invoke = invoke;
window._listen = listen;
window._appWindow = appWindow;
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from 'soundtouchjs';
window._stretch = (buf, tempo, ctx) => {
  const st = new SoundTouch(); st.tempo = tempo;
  const f = new SimpleFilter(new WebAudioBufferSource(buf), st);
  const len = Math.ceil(buf.length / tempo) + 16384;
  const out = ctx.createBuffer(2, len, buf.sampleRate);
  const L = out.getChannelData(0), R = out.getChannelData(1);
  const tmp = new Float32Array(16384);
  let pos = 0, got;
  while (pos < len - 8192 && (got = f.extract(tmp, 8192)) > 0) {
    for (let i = 0; i < got; i++) { L[pos + i] = tmp[2*i]; R[pos + i] = tmp[2*i + 1]; }
    pos += got;
  }
  return out;
};

// Stretch in Web Worker: un worker per stem, in parallelo. Ritorna { promise, cancel }
window._stretchAsync = (buf, tempo, ctx, pitch = 0) => {
  const w = new Worker('worker-bundle.js');
  const L = buf.getChannelData(0).slice();
  const R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
  const promise = new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const out = ctx.createBuffer(2, e.data.len, buf.sampleRate);
      out.copyToChannel(e.data.L, 0);
      out.copyToChannel(e.data.R, 1);
      w.terminate();
      resolve(out);
    };
    w.onerror = (err) => { w.terminate(); reject(err); };
  });
  w.postMessage({ L, R, tempo, pitch }, [L.buffer, R.buffer]);
  return { promise, cancel: () => w.terminate() };
};
