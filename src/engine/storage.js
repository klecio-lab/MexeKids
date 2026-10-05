// Persistência local (recordes, ajustes). Tudo em localStorage, sem backend.
const get = (k, fb) => {
  try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); }
  catch { return fb; }
};
const set = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

export const storage = {
  // recorde geral (maior nº de defesas) + por jogo
  best: (gameId) => get(`movokids_best_${gameId}`, 0),
  saveBest: (gameId, score) => {
    const prev = get(`movokids_best_${gameId}`, 0);
    if (score > prev) set(`movokids_best_${gameId}`, score);
    return Math.max(prev, score);
  },
  // compat: recorde antigo do goleiro
  legacyBest: () => Number(localStorage.getItem('movokids_best') || 0),
  settings: () => get('movokids_settings', { holdSeconds: 1.2, sound: true }),
  saveSettings: (s) => set('movokids_settings', s)
};
