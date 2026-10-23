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