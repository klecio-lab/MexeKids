// Poderes da Voz — lógica pura (sem imports): testável em Node.
export const ELEMENTS = {
  fogo: { emoji: '🔥', color: 0xf97316, css: '#f97316' },
  gelo: { emoji: '❄️', color: 0x38bdf8, css: '#38bdf8' },
  raio: { emoji: '⚡', color: 0xeab308, css: '#eab308' },
};
export const ELEMENT_IDS = Object.keys(ELEMENTS);

// "FOGO!", "solte o gelo", "raio mcqueen" -> elemento (ou null)
export function parseElement(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (t.includes('fog')) return 'fogo';
  if (t.includes('gel') || t.includes('fri') || t.includes('ice')) return 'gelo';
  if (t.includes('rai') || t.includes('relamp') || t.includes('trov')) return 'raio';
  return null;
}

// carga 0..1: grito acima do limiar carrega, silêncio esvazia devagar
export function chargeStep(charge, rms, threshold, dt) {
  const d = rms > threshold ? (rms - threshold) * 2.4 : -0.22;
  return Math.max(0, Math.min(1, charge + d * dt));
}

// pontos: base 1 + combinou elemento +1 + carga máxima (crítico) +1
export function pointsFor(match, crit) {
  return 1 + (match ? 1 : 0) + (crit ? 1 : 0);
}
