// Reconhecimento de gestos da mão — puro JS, sem dependências (testável em Node).
// Convenção MediaPipe Hands (21 pontos, x/y normalizados 0..1, y cresce pra baixo):
// punho 0; dedão 1-4 (ponta 4); indicador 5-8; médio 9-12; anelar 13-16; mindinho 17-20.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Tamanho da mão (punho -> base do dedo médio): régua p/ medidas relativas
export function handSize(lm) {
  if (!lm || lm.length < 21) return 1;
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1;
}

// 🤏 pinça (polegar + indicador encostados): gatilho do canhão
export function isPinch(lm, maxRatio = 0.4) {
  if (!lm || lm.length < 21) return false;
  return dist(lm[4], lm[8]) / handSize(lm) < maxRatio;
}

// ✌️ paz (indicador + médio esticados, anelar + mindinho dobrados): troca de arma
export function isPeace(lm) {
  if (!lm || lm.length < 21) return { ok: false, score: 0 };
  const size = handSize(lm);
  const wrist = lm[0];
  const extended = (tip, mcp) => dist(lm[tip], wrist) / size > dist(lm[mcp], wrist) / size + 0.15;
  const curled = (tip, pip) => dist(lm[tip], wrist) < dist(lm[pip], wrist);
  let pass = 0;
  if (extended(8, 5)) pass++;   // indicador esticado
  if (extended(12, 9)) pass++;  // médio esticado
  if (curled(16, 14)) pass++;   // anelar dobrado
  if (curled(20, 18)) pass++;   // mindinho dobrado
  return { ok: pass === 4, score: pass / 4 };
}

// 👍 joinha frontal: dedão esticado pra cima + outros 4 dedos dobrados.
// Retorna { ok, score 0..1 } — score alimenta a barrinha de progresso.
export function isThumbsUp(lm) {
  if (!lm || lm.length < 21) return { ok: false, score: 0 };
  const wrist = lm[0];
  const size = dist(wrist, lm[9]) || 1; // punho -> base do dedo médio (escala da mão)

  let pass = 0;
  const total = 6;

  // 1) dedão esticado: ponta longe do punho (relativo ao tamanho da mão)
  if (dist(lm[4], wrist) / size > 0.95) pass++;
  // 2) dedão apontando pra cima (ponta acima da junta do meio)
  if (lm[4].y < lm[2].y) pass++;
  // 3-6) demais dedos dobrados: ponta mais perto do punho que a junta do meio
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
  for (const [tip, pip] of fingers) {
    if (dist(lm[tip], wrist) < dist(lm[pip], wrist)) pass++;
  }

  return { ok: pass === total, score: pass / total };
}
