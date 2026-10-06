// Motor de VOZ: volume do grito (RMS) + palavras mágicas em pt-BR.
// Tudo com guardas: sem mic / sem Chrome / negado = jogo segue no fallback.
import { parseElement } from '../games/powersLogic.js';

let stream = null, actx = null, analyser = null, buf = null;
let smooth = 0, floor = 0.02, calibrating = false;
let recog = null, wantRecog = false, wordCb = null, micOk = false;

function rms() {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    s += v * v;
  }
  return Math.sqrt(s / buf.length);
}

function startRecognition() {
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    wantRecog = true;
    recog = new SR();
    recog.lang = 'pt-BR';
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (ev) => {
      try {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const el = parseElement(ev.results[i][0].transcript);
          if (el && wordCb) wordCb(el);
        }
      } catch {}
    };
    recog.onend = () => {
      // Chrome derruba sozinho: religa enquanto o jogo quiser ouvir
      if (wantRecog) { try { recog.start(); } catch {} }
    };
    recog.start();
  } catch { recog = null; }
}

export const voice = {
  // pede o mic, calibra o barulho da sala (~1.2s) e liga o ouvido. Retorna true se tem mic.
  async ensure() {
    if (micOk) return true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaStreamSource(stream);
      analyser = actx.createAnalyser();
      analyser.fftSize = 512;
      buf = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
      // calibra o chão de ruído da sala
      calibrating = true;
      let sum = 0, n = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 1200) {
        sum += rms(); n++;
        await new Promise(r => setTimeout(r, 60));
      }
      floor = n ? sum / n + 0.015 : 0.03;
      calibrating = false;
      micOk = true;
      startRecognition();
      return true;
    } catch {
      micOk = false;
      return false;
    }
  },
  // volume 0..1 suavizado (0 durante a calibragem)
  level() {
    if (!micOk || calibrating) return 0;
    try {
      smooth += (rms() - smooth) * 0.35;
      return Math.max(0, Math.min(1, smooth * 2.2));
    } catch { return 0; }
  },
  // acima disso = grito de verdade (não a TV de fundo)
  threshold() { return floor * 2.2 + 0.09; },
  onWord(cb) { wordCb = cb; },
  get hasMic() { return micOk; },
  stop() {
    wantRecog = false;
    try { recog && recog.abort(); } catch {}
    recog = null;
    try { stream && stream.getTracks().forEach(t => t.stop()); } catch {}
    stream = null;
    try { actx && actx.close(); } catch {}
    actx = null; analyser = null; micOk = false; smooth = 0;
  }
};
