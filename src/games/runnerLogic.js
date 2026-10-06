// Corrida Maluca — lógica pura (sem imports): testável em Node.
// joints vêm em METROS no plano do jogo (ver games/_template.js).
export const LANES = [-1.6, 0, 1.6];
export const LIVES = 3;

// Faixa pelo quadril, com histerese (não tremula no meio!)
// Passou de ±0.7 = trocou; perto do meio (±0.35) = volta; entre os dois = segura.
export function laneFor(hipX, current) {
  if (hipX < -0.7) return -1;
  if (hipX > 0.7) return 1;
  if (Math.abs(hipX) < 0.35) return 0;
  return current;
}

export function createBody() {
  return { hipBase: null, headBase: null };
}
// Pulo: quadril sobe 0.25m acima da base (base adapta devagar, em pé).
// Agachar: quadril 0.2m abaixo da base. Retorna { jump, crouch } em metros.
export function bodyMoves(st, hipY, headY, dt) {
  if (st.hipBase === null) { st.hipBase = hipY; st.headBase = headY; }
  const fast = Math.min(1, dt * 6), slow = Math.min(1, dt * 0.25);
  // base segue devagar (não come o agachamento contínuo nem o pulo)
  st.hipBase += (hipY - st.hipBase) * slow;
  st.headBase += (headY - st.headBase) * slow;
  const jump = Math.max(0, hipY - st.hipBase - 0.12);
  const crouch = Math.max(0, st.hipBase - hipY - 0.12);
  void fast;
  return { jump, crouch };
}

// Colisão jogador x obstáculo (caixas 2.5D: mesma faixa + sobreposição em y + perto em z)
export function hitsPlayer(p, o) {
  if (p.lane !== o.lane) return false;
  if (Math.abs(o.z) > 0.7) return false;
  return p.top > o.bottom && p.bottom < o.top;
}

// Velocidade da pista por nível (m/s) + intervalo de spawn (s)
export function speedFor(level) { return Math.min(18, 8 + level * 1.2); }
export function spawnGap(level) { return Math.max(0.9, 1.9 - level * 0.12); }
