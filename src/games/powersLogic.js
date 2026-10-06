// Poderes da Voz — lógica pura (sem imports): testável em Node.
export const ELEMENTS = {
  fogo: { emoji: '🔥', color: 0xf97316, css: '#f97316' },
  gelo: { emoji: '❄️', color: 0x38bdf8, css: '#38bdf8' },
  raio: { emoji: '⚡', color: 0xeab308, css: '#eab308' },
};
export const ELEMENT_IDS = Object.keys(ELEMENTS);

// "FOGO!", "solte o gelo", "raio mcqueen" -> elemento (ou null)
// Com apelidos: o Chrome às vezes ouve "fou", "jel", "raiu" — vale igual!
const ALIASES = [
  ['fogo', ['fog', 'fou', 'foc', 'folg']],
  ['gelo', ['gel', 'jel', 'gil', 'fri', 'ice']],
  ['raio', ['rai', 'raiu', 'ray', 'relamp', 'trov']],
];
export function parseElement(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  for (const [el, keys] of ALIASES) {
    if (keys.some(k => t.includes(k))) return el;
  }
  return null;
}

// falar 1x = dispara na hora (poder sempre cheio); intervalo anti-duplo
export const CAST_COOLDOWN = 0.8;

// pontos: base 1 + combinou elemento +1 + carga máxima (crítico) +1
export function pointsFor(match, crit) {
  return 1 + (match ? 1 : 0) + (crit ? 1 : 0);
}
