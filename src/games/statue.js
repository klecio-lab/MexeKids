// 🧍 Estátua Mágica — dance com a música; quando PARAR, congele!
// Regra simples de criança: ficou paradinho 3s = ponto. Sem pose específica.
// Implementa o contrato do hub (ver games/_template.js).
import * as THREE from 'three';
import { buildStage, stageRefs } from '../game/stage.js';
import { Avatar3D } from '../game/avatar3d.js';
import { Particles3D } from '../game/particles3d.js';
import { sounds, audioCtx, playNote } from '../engine/audio.js';
import { storage } from '../engine/storage.js';

// Musiquinha alegre em loop (sequenciador simples no AudioContext compartilhado)
const TUNE = [523, 659, 784, 659, 880, 784, 659, 587, 523, 659, 784, 880, 784, 659, 587, 523];
class MusicBox {
  constructor() { this.timer = null; this.step = 0; }
  start() {
    this.stop();
    try { audioCtx(); } catch { return; }
    this.step = 0;
    this.timer = setInterval(() => {
      try { playNote(TUNE[this.step % TUNE.length], 0, 0.18); } catch {}
      this.step++;
    }, 200);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

// Quanto o corpo mexeu entre frames (soma nariz + punhos, em metros).
// Parado de verdade ~= 0.001 (deadzone do smoothing); dançando >> 0.1.
export function bodyMotion(joints, prev) {
  if (!joints || !prev) return 99;
  let m = 0;
  for (const k of ['nose', 'lWr', 'rWr']) {
    if (joints[k] && prev[k]) m += Math.hypot(joints[k].x - prev[k].x, joints[k].y - prev[k].y);
  }
  return m;
}
const STILL_MAX = 0.05;

const ROUNDS = 5;
const DANCE_S = 4.5;
const FREEZE_S = 8;
const HOLD_S = 3;

export class StatueGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 2.1, -4.0);
    this.camera.lookAt(0, 1.25, 7);

    const { tileMats } = buildStage(this.scene);
    this.tileMats = tileMats;
    this.avatar = new Avatar3D(this.scene);
    this.avatar.group.position.y = 0.06; // sola na pista (topo 0.08)
    this.particles = new Particles3D(this.scene);
    this.music = new MusicBox();

    this._provider = null;
    this._frameHook = null;
    this.clock = new THREE.Clock();
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();

    this.points = 0; this.misses = 0; this.round = 0;
    this.running = false;
  }

  onResize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    this.music.stop();
    window.removeEventListener('resize', this.onResize);
    try { this.renderer.dispose(); } catch {}
  }

  setJointsProvider(fn) { this._provider = fn; }
  setFrameHook(fn) { this._frameHook = fn; }
  stats() {
    return {
      saves: this.points, goals: this.misses, level: Math.max(1, this.round),
      best: Math.max(storage.best('statue'), 0)
    };
  }

  async start() {
    this.points = 0; this.misses = 0; this.round = 0;
    this.running = true;
    this.clock.start();
    this.ev.onHud?.(this.stats());
    this.ev.onMsg?.('Prepare-se... 🎵');
    this.state = 'intro';
    this.stateT = 0;
    this.hold = 0;
    this.prevJ = null;
    this.msgT = 0;
    sounds.whistle();
    this.loop();
  }

  stop() { this.running = false; this.music.stop(); }

  nextRound() {
    if (this.round >= ROUNDS) return this.finish();
    this.round++;
    this.state = 'dance';
    this.stateT = 0;
    this.music.start();
    this.ev.onHud?.(this.stats());
    this.ev.onMsg?.('💃 DANCE!');
  }

  finish() {
    this.state = 'over';
    storage.saveBest('statue', this.points);
    this.ev.onHud?.(this.stats());
    setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    let joints = null;
    try { joints = this._provider ? this._provider() : null; } catch {}
    this.avatar.setJoints(joints);
    try { this._frameHook?.(); } catch {}

    this.stateT += dt;
    if (this.state === 'intro') {
      if (this.stateT > 1.6) this.nextRound();
    } else if (this.state === 'dance') {
      if (this.stateT > DANCE_S) {
        this.music.stop();
        sounds.countdown();
        this.state = 'freeze';
        this.stateT = 0;
        this.hold = 0;
        this.prevJ = null;
        this.ev.onMsg?.('❄️ CONGELOU! Nem pisque!');
      }
    } else if (this.state === 'freeze') {
      const motion = bodyMotion(joints, this.prevJ);
      if (joints) {
        this.prevJ = {
          nose: { ...joints.nose }, lWr: { ...joints.lWr }, rWr: { ...joints.rWr }
        };
      }
      const still = joints ? motion < STILL_MAX : false;
      this.hold = still ? this.hold + dt : Math.max(0, this.hold - dt * 2);

      this.msgT += dt;
      if (this.msgT > 0.2) {
        this.msgT = 0;
        const bar = '▓'.repeat(Math.round((this.hold / HOLD_S) * 8)).padEnd(8, '░');
        this.ev.onMsg?.(`❄️ ${bar}`);
      }
      if (this.hold >= HOLD_S) {
        this.points++;
        sounds.ding();
        this.particles.burst(new THREE.Vector3(0, 1.4, 0.3), 60);
        this.ev.onHud?.(this.stats());
        this.ev.onPop?.('❄️ ESTÁTUA!');
        this.state = 'rest';
        this.stateT = 0;
      } else if (this.stateT > FREEZE_S) {
        this.misses++;
        this.ev.onMsg?.('😅 Mexeu... foi por pouco!');
        this.ev.onHud?.(this.stats());
        this.state = 'rest';
        this.stateT = 0;
      }
    } else if (this.state === 'rest') {
      if (this.stateT > 1.6) this.nextRound();
    }

    this.avatar.update(dt);
    this.particles.update(dt);
    // pista e globo no ritmo: piscam na dança, CONGELAM junto no "congele!"
    const dancing = this.state === 'dance';
    const t = this.clock.elapsedTime;
    this.tileMats.forEach((m, i) => {
      m.emissiveIntensity = dancing ? 1.4 + Math.sin(t * 10 + i * 1.3) * 0.9 : 0.3;
    });
    if (stageRefs.disco && dancing) stageRefs.disco.rotation.y += dt * 1.6;
    stageRefs.beams.forEach((b, i) => {
      b.rotation.z = b.userData.baseRot + (dancing ? Math.sin(t * 2 + i * 2) * 0.18 : 0);
    });
    this.renderer.render(this.scene, this.camera);
  };
}
