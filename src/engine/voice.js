// Motor de VOZ: volume do grito (RMS) + palavras mágicas em pt-BR.
// Tudo com guardas: sem mic / sem Chrome / negado = jogo segue no fallback.
import { parseElement } from '../games/powersLogic.js';

let stream = null;
let recog = null, wantRecog = false, wordCb = null, micOk = false;

function startRecognition() {
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    wantRecog = true;
    recog = new SR();
    recog.lang = 'pt-BR';
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 5; // ouvido sensível: vale qualquer palpite que bata!
    recog.onresult = (ev) => {
      try {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          for (let a = 0; a < res.length; a++) {
            const el = parseElement(res[a].transcript);
            if (el && wordCb) { wordCb(el); break; }
          }
        }
      } catch {}
    };
    const religa = () => {
      // Chrome derruba sozinho: religa enquanto o jogo quiser ouvir
      if (wantRecog && recog) {
        try { recog.start(); } catch { setTimeout(religa, 400); }
      }
    };
    recog.onerror = () => setTimeout(religa, 300);
    recog.onend = () => setTimeout(religa, 200);
    recog.start();
  } catch { recog = null; }
}

export const voice = {
  // pede o mic e liga o ouvido pras palavras mágicas. Falar 1x = dispara!
  // Sem gritaria: sem medidor de volume, sem calibragem. Retorna true se tem mic.
  async ensure() {
    if (micOk) return true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      micOk = true;
      startRecognition();
      return true;
    } catch {
      micOk = false;
      return false;
    }
  },
  onWord(cb) { wordCb = cb; },
  get hasMic() { return micOk; },
  stop() {
    wantRecog = false;
    try { recog && recog.abort(); } catch {}
    recog = null;
    try { stream && stream.getTracks().forEach(t => t.stop()); } catch {}
    stream = null;
    micOk = false;
  }
};
