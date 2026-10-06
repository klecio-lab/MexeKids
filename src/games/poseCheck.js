// Estátua Cantada — poses + melodia. Módulo PURO (sem imports): testável em Node.
// A cantiga é sintetizada via WebAudio (sem arquivo, sem gravação original).
export const POSES = [
  { id: 'head', cmd: '✋🧠 MÃO NA CABEÇA!', short: 'mão na cabeça' },
  { id: 'waist', cmd: '🤠 MÃO NA CINTURA!', short: 'mão na cintura' },
];

// Cantiga alegre em Dó maior, 32 tempos (frase A = aguda, frase B = grave).
// Formato: [frequência Hz, tempos]. 1 tempo ~= 0.19s → ~6s por volta.
const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880;
const G4 = 392.0, A4 = 440.0, B4 = 493.88;
export const TUNE = [
  // A: "mão na cabeça..." (agudo e saltitante)
  [E5, 1], [E5, 1], [F5, 1], [G5, 1],
  [G5, 1], [F5, 1], [E5, 1], [D5, 1],
  [E5, 1], [E5, 1], [F5, 1], [G5, 1],
  [A5, 1], [G5, 1], [E5, 2],
  // B: "mão na cintura..." (desce e resolve)
  [G4, 1], [G4, 1], [A4, 1], [B4, 1],
  [C5, 1], [B4, 1], [A4, 1], [G4, 1],
  [A4, 1], [B4, 1], [C5, 1], [C5, 1],
  [D5, 1], [C5, 3],
];
export const TUNE_BEATS = TUNE.reduce((a, [, b]) => a + b, 0); // 32

// A pose passou? joints em METROS no plano do jogo (ver games/_template.js).
// Generoso de propósito: criança não tem precisão cirúrgica.
export function checkPose(joints, poseId) {
  if (!joints || !joints.lWr || !joints.rWr || !joints.nose || !joints.lHip || !joints.rHip) return false;
  const noseY = joints.nose.y;
  const hipY = (joints.lHip.y + joints.rHip.y) / 2;
  const lowWr = Math.min(joints.lWr.y, joints.rWr.y); // a mão mais baixa manda
  if (poseId === 'head') return lowWr > noseY - 0.18; // as DUAS no alto, na altura da cabeça
  if (poseId === 'waist') {
    const okL = Math.abs(joints.lWr.y - hipY) < 0.28;
    const okR = Math.abs(joints.rWr.y - hipY) < 0.28;
    return okL && okR && lowWr < noseY - 0.3; // na cintura, longe da cabeça
  }
  return false;
}
