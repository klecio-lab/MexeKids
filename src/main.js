// Hub MovoKids — fino de propósito: telas + registro de jogos.
// Todo o trabalho pesado (câmera, pose, mãos, gestos) mora no InputManager.
// Adicionar um jogo = 1 arquivo em games/ + 1 linha em games/registry.js.
import { InputManager, holdProgress, resetHold } from './engine/input.js';
import { registerScreens, show, el } from './engine/screens.js';
import { storage } from './engine/storage.js';
import { sounds } from './engine/audio.js';
import { GAMES, getGame } from './games/registry.js';
import { drawSkeleton2D } from './vision/tracking.js';
import { gsap } from 'gsap';

registerScreens();

const input = new InputManager(el('cam-hidden'), [el('cam-preview'), el('cam-game')]);
let selectedId = null;
let game = null;
let detectRaf = 0;
let starting = false;
let visionLoaded = false;
const holdState = { value: 0 };
const holdSecs = () => storage.settings().holdSeconds ?? 1.2;

function boot() {
  if (!window.WebGLRenderingContext) el('compat-msg').textContent = '⚠️ Navegador sem WebGL.';
  el('btn-how').onclick = () => { sounds.click(); el('how-box').classList.toggle('hidden'); };
  renderCards();
  el('btn-play-now').onclick = () => startGame();
  el('btn-menu').onclick = () => { fullCleanup(); show('menu'); renderCards(); };
  el('btn-quit').onclick = () => { fullCleanup(); show('menu'); renderCards(); };
}

// Hub: 1 card por jogo registrado (com recorde)
function renderCards() {
  const list = el('game-list');
  list.innerHTML = '';
  for (const g of GAMES) {
    const card = document.createElement('div');
    card.className = 'game-card';
    const best = Math.max(storage.best(g.id), g.id === 'goalkeeper' ? storage.legacyBest() : 0);
    card.innerHTML = `<div class="game-emoji">${g.emoji}</div>
      <div class="game-info"><b>${g.title}</b><span>${g.desc}</span>
      <span class="game-best">🏆 Recorde: ${best}</span></div>
      <button class="big-btn">▶ JOGAR</button>`;
    card.querySelector('button').onclick = () => { sounds.click(); selectedId = g.id; startCalib(); };
    list.appendChild(card);
  }
}

async function startCalib() {
  const meta = getGame(selectedId);
  if (!meta) return;
  sounds.click();
  show('calib');
  input.reset();
  resetHold(holdState);
  starting = false;
  el('calib-title').textContent = `${meta.emoji} ${meta.title}`;
  el('calib-msg').textContent = 'Carregando câmera... 📷';
  el('btn-play-now').classList.add('hidden');
  el('gesture-box').classList.add('hidden');
  el('gesture-fill').style.width = '0%';

  try { await input.ensureCamera(); }
  catch { el('calib-msg').textContent = '❌ Câmera bloqueada. Permita o acesso e recarregue (modo mouse ativo para teste).'; }

  if (!visionLoaded) {
    el('calib-msg').textContent = 'Carregando inteligência (MediaPipe)... 🧠';
    try { await input.initVision({ hands: true }); visionLoaded = true; }
    catch { el('calib-msg').textContent = '❌ Falha ao carregar MediaPipe. Recarregue.'; return; }
  }
  el('calib-msg').textContent = 'Se posicione! 🙋';

  cancelAnimationFrame(detectRaf);
  let okFrames = 0, lastT = performance.now();
  const loopCalib = () => {
    detectRaf = requestAnimationFrame(loopCalib);
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    const frame = input.nextFrame({ pose: true, hands: true });
    const framed = frame.hasCamera ? frame.framing?.ok : true; // sem câmera: modo mouse
    if (framed) {
      okFrames++;
      if (okFrames > 25) {
        el('btn-play-now').classList.remove('hidden');
        el('gesture-box').classList.toggle('hidden', !(input.handsEnabled && frame.hasCamera));
        el('calib-msg').textContent = '✅ Pronto! Aperte JOGAR ou segure o 👍!';
      }
    } else {
      okFrames = 0;
      el('btn-play-now').classList.add('hidden');
      el('gesture-box').classList.add('hidden');
      el('calib-msg').textContent = frame.framing?.msg || '👀 Apareça na câmera!';
    }
    el('calib-fill').style.width = `${Math.round((frame.hasCamera ? frame.framing?.score ?? 0 : 1) * 100)}%`;

    // 👍 segurado = start automático (só com enquadramento OK)
    if (framed && input.handsEnabled && frame.hasCamera && !starting) {
      const prog = holdProgress(holdState, holdSecs(), frame.thumbsUp, dt);
      el('gesture-fill').style.width = `${Math.round(prog * 100)}%`;
      if (prog >= 1) { starting = true; startGame(); }
    } else {
      resetHold(holdState);
      el('gesture-fill').style.width = '0%';
    }
  };
  loopCalib();
}

async function startGame() {
  const meta = getGame(selectedId);
  if (!meta || (starting && game)) return;
  starting = true;
  try { sounds.click(); } catch {}
  cancelAnimationFrame(detectRaf);
  if (game) { game.dispose(); game = null; }
  input.reset();
  show('game');
  const canvas = el('game3d');
  const skel = el('skeleton2d');

  if (!input.hasCamera) {
    try { await input.ensureCamera(); } catch { /* segue sem câmera (mouse) */ }
  }

  let lastFrame = null;
  game = meta.create(canvas, {
    onHud: (s) => {
      el('hud-saves').textContent = s.saves;
      el('hud-goals').textContent = s.goals;
      el('hud-level').textContent = s.level;
      el('hud-best').textContent = s.best ?? 0;
      // placar "pula" a cada ponto (GSAP)
      try {
        gsap.fromTo('#hud-saves', { scale: 1.7 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', overwrite: true });
      } catch {}
    },
    onMsg: (m) => { el('hud-msg').textContent = m; },
    onPop: (emoji) => {
      const f = el('feedback');
      f.textContent = emoji;
      f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop');
    },
    onGameOver: (s) => {
      const best = Math.max(storage.best(selectedId), selectedId === 'goalkeeper' ? storage.legacyBest() : 0);
      el('over-score').textContent = `${meta.emoji} Pontos: ${s.saves} • Nível ${s.level}`;
      el('over-record').textContent = `🏆 Recorde: ${best}`;
      el('over-stars').textContent = s.saves >= 10 ? '⭐⭐⭐' : s.saves >= 5 ? '⭐⭐' : '⭐';
      el('over-title').textContent = s.saves >= 5 ? '🎉 Você é um paredão!' : '💪 Bom jogo! Tente de novo!';
      el('btn-again').onclick = () => startGame();
      game.stop(); // câmera segue viva: rejogar é instantâneo
      show('over');
      startOverWatch();
    }
  });
  // Ícones do HUD por jogo (placar faz sentido em cada um)
  const icons = meta.icons || ['⭐', '❌', '🔥'];
  el('hud-i1').textContent = icons[0];
  el('hud-i2').textContent = icons[1];
  el('hud-i3').textContent = icons[2];
  el('hud-goals-max').textContent = meta.goalsMax || '';
  // Loop ÚNICO: o jogo puxa o frame pronto dentro do próprio render.
  // Mãos só ligadas se o jogo pedir (wantsHands) = CPU livre nos outros.
  game.setJointsProvider(() => {
    lastFrame = input.nextFrame({ pose: true, hands: !!meta.wantsHands });
    return lastFrame.joints;
  });
  game.setHandsProvider?.(() => (lastFrame ? lastFrame.handsList : []));
  game.setFrameHook(() => drawSkeleton2D(skel, lastFrame?.raw || null));
  el('btn-play-now').onclick = () => startGame();
  await game.start();
  starting = false;
}

// Tela de fim: joinha rejoga (só mãos rodam aqui = barato)
function startOverWatch() {
  resetHold(holdState);
  const box = el('over-gesture');
  const fill = el('over-gesture-fill');
  const canGesture = input.handsEnabled && input.hasCamera;
  box.classList.toggle('hidden', !canGesture);
  if (fill) fill.style.width = '0%';
  if (!canGesture) return;
  cancelAnimationFrame(detectRaf);
  let lastT = performance.now();
  const loopOver = () => {
    detectRaf = requestAnimationFrame(loopOver);
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    const frame = input.nextFrame({ pose: false, hands: true });
    const prog = holdProgress(holdState, holdSecs(), frame.thumbsUp, dt);
    if (fill) fill.style.width = `${Math.round(prog * 100)}%`;
    if (prog >= 1 && !starting) startGame();
  };
  loopOver();
}

function fullCleanup() {
  cancelAnimationFrame(detectRaf);
  if (game) { game.dispose(); game = null; }
  input.fullCleanup();
  starting = false;
  resetHold(holdState);
}

boot();
