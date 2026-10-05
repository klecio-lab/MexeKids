// Tracking: smoothing + mapeamento landmark -> coords do gol 3D + calibragem
// Índices MediaPipe Pose: 0 nariz, 11/12 ombros, 13/14 cotovelos, 15/16 punhos,
// 23/24 quadris, 25/26 joelhos, 27/28 tornozelos, 7/8 orelhas

export const IDX = { NOSE:0, L_SH:11, R_SH:12, L_EL:13, R_EL:14, L_WR:15, R_WR:16, L_HIP:23, R_HIP:24, L_KNEE:25, R_KNEE:26, L_ANK:27, R_ANK:28 };

const smooth = new Map();
const LERP = 0.45;

function lerpPt(key, x, y, z = 0) {
  const p = smooth.get(key);
  if (!p) { const o = { x, y, z }; smooth.set(key, o); return o; }
  const move = Math.hypot(x - p.x, y - p.y);
  if (move < 0.0012) return p; // deadzone: parado = zero tremedeira
  // adaptativo: movimento rápido (soco/defesa) segue quase direto = menos lag;
  // movimento lento filtra mais = mais precisão
  const t = move > 0.02 ? 0.9 : LERP;
  p.x += (x - p.x) * t;
  p.y += (y - p.y) * t;
  p.z += (z - p.z) * t;
  return p;
}

export function resetSmooth() { smooth.clear(); }

export function isVisible(lm, i, min = 0.4) {
  const p = lm?.[i];
  return p && (p.visibility ?? 1) >= min;
}

// Dimensões do gol padrão (largura 7.32m, altura 2.44m). Avatar fica em z=0.
// (Helper antigo não-espelhado abaixo está desativado — ver mapJointsToGoal.)
export const GOAL_W = 7.32;
export const GOAL_H = 2.44;

export function landmarkToGoal(lm, out = {}) {
  // lm.x: 0 esq .. 1 dir (imagem não espelhada). Espelha: worldX = (0.5 - x) * span
  const wx = (0.5 - lm.x) * (GOAL_W * 1.25);
  // lm.y: 0 topo. Mapeia y ~0.15 (cabeça em cima) .. ~0.95 (pé embaixo) para altura 2.2..0
  const wy = (1 - lm.y) * 3.1 - 0.35;
  const wz = (lm.z ?? 0) * -2; // soco pra frente = z positivo
  return out;
}

export function mapJointsToGoal(lm) {
  if (!lm) return null;
  // Visão POR TRÁS do goleiro (câmera dentro do gol olhando pro campo):
  // SEM espelho — sua direita é a direita da tela, igual sombra.
  // (lm.x pequeno = sua mão direita no frame cru → mundo -x = direita da tela)
  const get = (i) => {
    const p = lm[i];
    const s = lerpPt('j' + i, p.x, p.y, p.z || 0);
    return {
      x: (s.x - 0.5) * (GOAL_W * 1.25),
      y: Math.max(-0.2, Math.min(2.8, (1 - s.y) * 3.1 - 0.35)),
      z: (s.z || 0) * -2,
      visible: (p.visibility ?? 1) > 0.35
    };
  };
  return {
    nose: get(0),
    lSh: get(IDX.L_SH), rSh: get(IDX.R_SH),
    lEl: get(IDX.L_EL), rEl: get(IDX.R_EL),
    lWr: get(IDX.L_WR), rWr: get(IDX.R_WR),
    lHip: get(IDX.L_HIP), rHip: get(IDX.R_HIP),
    lKnee: get(IDX.L_KNEE), rKnee: get(IDX.R_KNEE),
    lAnk: get(IDX.L_ANK), rAnk: get(IDX.R_ANK)
  };
}

// Calibragem: precisa ver ombros + quadris, largura mínima e centralizado
export function checkFraming(lm) {
  if (!lm) return { ok: false, msg: '👀 Apareça na câmera!', score: 0 };
  const need = [IDX.L_SH, IDX.R_SH, IDX.L_HIP, IDX.R_HIP, IDX.L_WR, IDX.R_WR];
  const visCount = need.filter(i => isVisible(lm, i, 0.4)).length;
  if (visCount < 5) return { ok: false, msg: '🙋 Abra os braços! Quero ver seus punhos!', score: visCount / 6 };
  const shW = Math.abs(lm[IDX.L_SH].x - lm[IDX.R_SH].x);
  if (shW < 0.16) return { ok: false, msg: '🔍 Chegue MAIS PERTO da câmera!', score: 0.4 };
  if (shW > 0.65) return { ok: false, msg: '📏 Afaste-se um pouquinho!', score: 0.6 };
  const cx = (lm[IDX.L_SH].x + lm[IDX.R_SH].x) / 2;
  if (Math.abs(cx - 0.5) > 0.16) return { ok: false, msg: cx < 0.5 ? '➡️ Vá para sua direita!' : '⬅️ Vá para sua esquerda!', score: 0.7 };
  return { ok: true, msg: '✅ Perfeito! Fique aí!', score: 1 };
}

// Desenha esqueletinho 2D no PiP
const BONES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],[0,11],[0,12]];
export function drawSkeleton2D(canvas, lm) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!lm) return;
  ctx.lineWidth = 4; ctx.strokeStyle = '#22c55e'; ctx.fillStyle = '#facc15';
  ctx.beginPath();
  for (const [a, b] of BONES) {
    // espelha X pro PiP
    ctx.moveTo((1 - lm[a].x) * canvas.width, lm[a].y * canvas.height);
    ctx.lineTo((1 - lm[b].x) * canvas.width, lm[b].y * canvas.height);
  }
  ctx.stroke();
  for (const i of [0, 11, 12, 13, 14, 15, 16]) {
    ctx.beginPath();
    ctx.arc((1 - lm[i].x) * canvas.width, lm[i].y * canvas.height, 5, 0, 7);
    ctx.fill();
  }
}
