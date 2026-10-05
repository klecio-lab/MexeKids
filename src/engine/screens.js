// Router mínimo de telas (mostra uma, esconde as outras). Nomes curtos:
// show('menu' | 'calib' | 'game' | 'over')
const SHORT = { menu: 'screen-menu', calib: 'screen-calib', game: 'screen-game', over: 'screen-over' };
const cache = {};
export function registerScreens() {
  for (const k in SHORT) cache[k] = document.getElementById(SHORT[k]);
}
export function show(name) {
  for (const k in cache) cache[k]?.classList.toggle('hidden', k !== name);
}
export function el(id) { return document.getElementById(id); }
