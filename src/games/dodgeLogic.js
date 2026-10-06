// Queimado — placar puro (sem imports): testável em Node.
// Raspou (passou a <1m do corpo sem encostar) vale +2; desvio limpo +1.
export const NEAR_MISS_D = 1.0;
export const LIVES = 3;
export function scoreFor(wasHit, minDist) {
  if (wasHit) return { dodges: 0, hits: 1 };
  const bonus = minDist < NEAR_MISS_D ? 1 : 0;
  return { dodges: 1 + bonus, hits: 0 };
}
