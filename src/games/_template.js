// ============================================================
// TEMPLATE — copie este arquivo para criar um jogo novo. Ex:
//   src/games/estrelas.js  →  registra em games/registry.js
// ============================================================
//
// O motor (engine) te entrega tudo mastigado todo frame:
//
//   frame = input.nextFrame({ pose: true, hands: true })
//   frame.joints  -> { lWr:{x,y,z}, rWr, lEl, rEl, lSh, rSh, nose,
//                      lHip, rHip, lKnee, rKnee, lAnk, rAnk } | null
//                      (coords em METROS no plano do jogo; null = sem dados)
//   frame.raw       -> landmarks crus da pose (33 pts) | null
//   frame.thumbsUp  -> true se 👍 visível (auto-start / confirmar)
//   frame.framing   -> { ok, msg, score } (calibragem do enquadramento)
//   frame.hasCamera -> false = modo mouse (fallback de teste)
//
// Serviços prontos:
//   sounds.save() / sounds.goal() / ...  (engine/audio.js)
//   cheer('texto')                        (voz pt-BR)
//   storage.best(id) / saveBest(id, pts)  (engine/storage.js)
//   Avatar3D + getHitboxes()             (game/avatar3d.js — boneco + colisão)
//   Particles3D                          (game/particles3d.js — confete)
//
// Contrato com o hub (main.js):
//   - create(canvas, events) -> instância
//   - events: { onHud(stats), onMsg(texto), onPop(emoji), onGameOver(stats) }
//   - métodos: start() / stop() / dispose()
//   - setJointsProvider(fn): o jogo CHAMA fn() 1x por frame dentro do
//     próprio render (loop único = sem latência). Retorno = frame.joints.
//   - setFrameHook(fn): chamado 1x por frame (ex: desenhar esqueletinho PiP).
//
// Exemplo mínimo funcional:
//
//   import { sounds } from '../engine/audio.js';
//
//   export class MeuJogo {
//     constructor(canvas, events) { this.canvas = canvas; this.ev = events; ... }
//
//     setJointsProvider(fn) { this._provider = fn; }
//     setFrameHook(fn) { this._hook = fn; }
//
//     async start() {
//       this.score = 0;
//       this.running = true;
//       sounds.whistle();
//       this.ev.onHud?.({ saves: this.score, goals: 0, level: 1 });
//       this.loop();
//     }
//
//     stop() { this.running = false; }
//     dispose() { this.stop(); /* remove listeners, libera GL */ }
//
//     loop = () => {
//       if (!this.running) return;
//       requestAnimationFrame(this.loop);
//       const joints = this._provider ? this._provider() : null;
//       if (joints) {
//         // joints.lWr.x/y = posição da luva esquerda em metros. Colida!
//         if (tocouNaEstrela(joints.lWr)) { this.score++; sounds.save(); }
//       }
//       this._hook?.();
//       desenharTudo();
//     };
//   }
//
export const TEMPLATE_DOC = true;
