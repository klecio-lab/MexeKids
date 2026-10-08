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

export function resetSmooth() {
  smooth.clear();
  bodyRef.cx = 0.5; bodyRef.cy = 0.65; bodyRef.k = 3;
  bodyRef.base = null; bodyRef.jump = 0;
  bodyRef.leg = LEG_REF; bodyRef.legRef = LEG_REF;
  bodyRef.hasRef = false; bodyRef.lastGood = 0; bodyRef.lastJ = null;
  bodyRef.hipsOk = false;
}

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

// Mapeamento PROPORCIONAL AO CORPO (não explode perto/longe da câmera!):
// tudo é relativo ao quadril, escalado pela largura dos ombros.
// Perto ou longe, o boneco tem sempre o mesmo tamanho — só espelha o gesto.
// Visão POR TRÁS (sem espelho): sua direita = direita da tela.
let vidAspect = 16 / 9;
export function setAspect(a) { if (a > 0.5 && a < 3) vidAspect = a; }

const AVATAR_SHOULDER = 0.55; // ombros do boneco (m) ~= criança real (nada de gigante!)
const HIP_Y = 0.85;          // altura do quadril em pé
const LEG_REF = 1.15;        // perna (quadril->tornozelo) em pé, em metros-boneco
                             // = 0.75m reais x escala do boneco (0.55/0.35)
const bodyRef = {
  cx: 0.5, cy: 0.65, k: 3, base: null, jump: 0, leg: LEG_REF, legRef: LEG_REF,
  pcx: 0.5, pcy: 0.65, hasRef: false, lastGood: 0, lastJ: null, hipsOk: false
};
function copyJoints(J) { const o = {}; for (const k in J) o[k] = { ...J[k] }; return o; }

export function mapJointsToGoal(lm) {
  if (!lm) return null;
  const now = performance.now();
  const R = bodyRef;
  // Frame ruim (sem ombros = sem boneco) ou teleporte do tracker:
  // segura a última pose boa por 1s (oclusão momentânea), depois some.
  // Quadril fora do quadro (MERGULHO pro canto!) não congela: estima pelos
  // ombros p/ o boneco continuar seguindo. Nunca deforma com lixo!
  const bad = !isVisible(lm, IDX.L_SH, 0.35) || !isVisible(lm, IDX.R_SH, 0.35);
  const hipsOk = isVisible(lm, IDX.L_HIP, 0.35) && isVisible(lm, IDX.R_HIP, 0.35);
  const shCx = (lm[IDX.L_SH].x + lm[IDX.R_SH].x) / 2;
  const shCy = (lm[IDX.L_SH].y + lm[IDX.R_SH].y) / 2;
  let hipCx, hipCy;
  if (hipsOk) {
    hipCx = (lm[IDX.L_HIP].x + lm[IDX.R_HIP].x) / 2;
    hipCy = (lm[IDX.L_HIP].y + lm[IDX.R_HIP].y) / 2;
  } else {
    hipCx = shCx;
    hipCy = shCy + 0.45 / Math.max(1, R.k); // torso ~= 0.45m em norm
  }
  // teleporte = salto impossível num frame SÓ (mergulho de verdade passa!);
  // transição quadril visível<->estimado não conta como teleporte
  const jumped = R.hasRef && hipsOk === R.hipsOk
    && Math.hypot(hipCx - R.pcx, hipCy - R.pcy) > 0.45;
  if (bad || jumped) {
    if (R.lastJ && now - R.lastGood < 1000) return copyJoints(R.lastJ);
    return null;
  }
  R.pcx = hipCx; R.pcy = hipCy; R.hasRef = true; R.lastGood = now; R.hipsOk = hipsOk;
  const shW = Math.abs(lm[IDX.L_SH].x - lm[IDX.R_SH].x);
  // centro adaptativo: perto segue suave, longe COLA (mergulho não fica pra trás)
  const dcx = hipCx - R.cx, dcy = hipCy - R.cy;
  const f = 0.5 + 0.4 * Math.min(1, Math.hypot(dcx, dcy) / 0.3);
  R.cx += dcx * f;
  R.cy += dcy * f;
  const kTarget = Math.max(1.0, Math.min(7, AVATAR_SHOULDER / Math.max(0.05, shW)));
  R.k += (kTarget - R.k) * 0.08;
  // pulo: quadril sobe rápido = boneco sobe (baseline lenta ignora agachar contínuo)
  if (R.base === null) R.base = hipCy;
  R.base += (hipCy - R.base) * 0.005;
  R.jump += ((R.base - hipCy) * R.k / vidAspect - R.jump) * 0.4;
  const jumpOff = Math.max(-0.35, Math.min(0.6, R.jump));
  // agachar: perna encurta = raiz desce (baseline lentíssima não come o agachamento;
  // no ar (tuck no pulo) o peso zera p/ não afundar o salto)
  const legLen = ((lm[IDX.L_KNEE].y + lm[IDX.R_KNEE].y) / 2 - hipCy
    + ((lm[IDX.L_ANK].y + lm[IDX.R_ANK].y) / 2 - (lm[IDX.L_KNEE].y + lm[IDX.R_KNEE].y) / 2) * 0.5)
    * R.k / vidAspect;
  // tornozelo fora do quadro = dado chutado: não alimenta o agachamento
  const anklesOk = isVisible(lm, IDX.L_ANK, 0.3) && isVisible(lm, IDX.R_ANK, 0.3);
  if (anklesOk) {
    R.legRef += (legLen - R.legRef) * 0.0005; // deriva p/ o corpo real em minutos
    R.leg += (legLen - R.leg) * 0.2;
  }
  const crouch = Math.max(0, Math.min(0.5, R.legRef - R.leg));
  const airW = Math.max(0, Math.min(1, 1 - Math.max(0, R.jump) / 0.2));
  const rootY = HIP_Y + jumpOff - crouch * airW;
  const rootX = Math.max(-3.2, Math.min(3.2, (R.cx - 0.5) * GOAL_W * 1.3));
  const get = (i) => {
    const p = lm[i];
    const s = lerpPt('j' + i, p.x, p.y, p.z || 0);
    // BÔNUS DO BRAÇO ESTICADO: quanto mais longe do centro (em METROS, que
    // não depende da distância da câmera!), mais ganho. O canto chega com o
    // corpo DENTRO do quadro — sem precisar sair dele.
    const extM = Math.abs(s.x - R.cx) * R.k;
    const g = R.k * (1 + Math.min(0.6, extM * 0.9));
    return {
      x: Math.max(-GOAL_W / 2 - 0.6, Math.min(GOAL_W / 2 + 0.6, rootX + (s.x - R.cx) * g)),
      y: Math.max(-0.1, Math.min(2.9, rootY + (R.cy - s.y) * R.k / vidAspect)),
      z: (s.z || 0) * -2,
      visible: (p.visibility ?? 1) > 0.35
    };
  };
  const J = {
    nose: get(0),
    lSh: get(IDX.L_SH), rSh: get(IDX.R_SH),
    lEl: get(IDX.L_EL), rEl: get(IDX.R_EL),
    lWr: get(IDX.L_WR), rWr: get(IDX.R_WR),
    lHip: get(IDX.L_HIP), rHip: get(IDX.R_HIP),
    lKnee: get(IDX.L_KNEE), rKnee: get(IDX.R_KNEE),
    lAnk: get(IDX.L_ANK), rAnk: get(IDX.R_ANK)
  };
  // ATERRISSA: pé mais baixo nunca entra no chão (sola do tênis r=0.13 + folga)
  const minFoot = Math.min(J.lAnk.y, J.rAnk.y);
  if (minFoot < 0.15) {
    const lift = 0.15 - minFoot;
    for (const k in J) J[k].y = Math.min(2.9, J[k].y + lift);
  }
  R.lastJ = copyJoints(J);
  return J;
}

// Calibragem generosa: ombros + quadris visíveis (punhos NÃO exigidos!),
// distância e centro com margem p/ criança que não para quieta.
export function checkFraming(lm) {
  if (!lm) return { ok: false, msg: '👀 Apareça na câmera!', score: 0 };
  const need = [IDX.L_SH, IDX.R_SH, IDX.L_HIP, IDX.R_HIP, IDX.L_WR, IDX.R_WR];
  const visCount = need.filter(i => isVisible(lm, i, 0.4)).length;
  if (visCount < 4) return { ok: false, msg: '🙋 Quero ver seus ombros!', score: visCount / 6 };
  // quadris são o centro de tudo (mergulho, corrida, pulo): sem eles, nem começa
  if (!isVisible(lm, IDX.L_HIP, 0.4) || !isVisible(lm, IDX.R_HIP, 0.4))
    return { ok: false, msg: '🦵 Apareça da cintura pra cima!', score: 0.5 };
  const shW = Math.abs(lm[IDX.L_SH].x - lm[IDX.R_SH].x);
  if (shW < 0.13) return { ok: false, msg: '🔍 Chegue MAIS PERTO da câmera!', score: 0.4 };
  if (shW > 0.72) return { ok: false, msg: '📏 Afaste-se um pouquinho!', score: 0.6 };
  const cx = (lm[IDX.L_SH].x + lm[IDX.R_SH].x) / 2;
  if (Math.abs(cx - 0.5) > 0.2) return { ok: false, msg: cx < 0.5 ? '➡️ Vá para sua direita!' : '⬅️ Vá para sua esquerda!', score: 0.7 };
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
