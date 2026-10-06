// Áudio 100% sintetizado via WebAudio — sem arquivos, alegre e infantil.
// (placeholders: troque por mp3 depois sem mudar as chamadas)
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// Contexto compartilhado (ex: musiquinha da Estátua agenda notas nele)
export function audioCtx() { return ac(); }
export function playNote(freq, when = 0, dur = 0.2, type = 'triangle', vol = 0.22) {
  tone(freq, when, dur, type, vol);
}
function tone(freq, t0, dur, type = 'sine', vol = 0.25) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
}
export const sounds = {
  whistle() { tone(2200, 0, 0.15, 'square', 0.12); tone(2200, 0.18, 0.3, 'square', 0.12); },
  save() { // defesa! arpejo feliz
    tone(523, 0, 0.18, 'triangle', 0.3); tone(659, 0.1, 0.18, 'triangle', 0.3);
    tone(784, 0.2, 0.25, 'triangle', 0.3); tone(1047, 0.32, 0.4, 'sine', 0.3);
  },
  goal() { tone(392, 0, 0.3, 'sawtooth', 0.12); tone(330, 0.25, 0.4, 'sawtooth', 0.12); },
  kick() { tone(180, 0, 0.12, 'sine', 0.5); tone(95, 0.02, 0.18, 'sine', 0.5); },
  smack() { tone(240, 0, 0.07, 'square', 0.35); tone(120, 0.04, 0.1, 'square', 0.35); },
  pew() { tone(1250, 0, 0.06, 'square', 0.12); tone(800, 0.03, 0.07, 'square', 0.1); },
  pop() { tone(620, 0, 0.05, 'square', 0.28); tone(930, 0.03, 0.08, 'square', 0.25); },
  ding() { tone(1319, 0, 0.3, 'sine', 0.25); tone(1760, 0.12, 0.4, 'sine', 0.2); },
  countdown() { tone(880, 0, 0.12, 'square', 0.15); },
  go() { tone(1047, 0, 0.4, 'square', 0.2); },
  click() { tone(700, 0, 0.08, 'sine', 0.2); }
};
// (narrador por voz removido por preferência: só SFX daqui pra frente)
