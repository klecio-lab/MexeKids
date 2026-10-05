// Gerente do Jogo do Goleiro 3D — loop, colisão hitbox x bola, placar
import * as THREE from 'three';
import { buildStadium } from './stadium.js';
import { Avatar3D } from './avatar3d.js';
import { Ball3D } from './ball.js';
import { Particles3D } from './particles3d.js';
import { GOAL_W, GOAL_H } from '../vision/tracking.js';
import { sounds, cheer } from '../engine/audio.js';
import { storage } from '../engine/storage.js';

const CHEERS = ['Demais! 🧤', 'Que defesa! ⭐', 'Você é incrível!', 'Goleiro mágico! ✨'];
const COMFORT = ['Quase! Tenta de novo! 💪', 'Foi por pouco! ⚽', 'Respira e bora! 🌟'];

export class GoalkeeperGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    // Câmera DENTRO do gol, por trás do goleiro: você VÊ as costas do boneco
    // e a bola nasce pequena lá no campo e cresce vindo na sua cara.
    // Direita/esquerda 1:1, sem espelho.
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 2.1, -4.0);
    this.camera.lookAt(0, 1.25, 7);
    this.camBase = this.camera.position.clone();
    this.shake = 0;

    buildStadium(this.scene);
    this.avatar = new Avatar3D(this.scene);
    this.balls = [new Ball3D(this.scene), new Ball3D(this.scene), new Ball3D(this.scene)];
    this.particles = new Particles3D(this.scene);

    // marcador de mira (onde a bola vai) — ajuda a criança
    this.target = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 24),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    this.target.visible = false;
    this.scene.add(this.target);

    this.saves = 0; this.goals = 0; this.level = 1;
    this.state = 'idle';
    // Provedor de articulações: loop ÚNICO (detecção acontece aqui dentro,
    // imediatamente antes do render = menos latência e sem dessincronia)
    this._provider = null;
    this._frameHook = null;
    this.clock = new THREE.Clock();
    this.spawnTimer = 0;
    this.running = false;
    this.mouseBackup = { x: 0, y: 1.3, active: false, lastPose: 0 };
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.bindMouseFallback();
  }

  onResize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    // Libera listeners + GL para poder criar outro jogo no mesmo canvas (rejogar)
    this.stop();
    window.removeEventListener('resize', this.onResize);
    if (this._mouseFn) window.removeEventListener('mousemove', this._mouseFn);
    try { this.renderer.dispose(); } catch {}
  }

  bindMouseFallback() {
    // Se não há câmera, o mouse move as duas luvas (modo teste).
    // Sem espelho: mouse à direita = luvas à direita (câmera atrás do goleiro,
    // direita da tela = mundo -x).
    this._mouseFn = (e) => {
      if (Date.now() - this.mouseBackup.lastPose < 2500) return; // pose real tem prioridade
      const nx = (e.clientX / innerWidth - 0.5);
      const ny = 1 - e.clientY / innerHeight;
      this.mouseBackup.x = -nx * (GOAL_W * 1.1);
      this.mouseBackup.y = 0.3 + ny * 2.2;
      this.mouseBackup.active = true;
    };
    window.addEventListener('mousemove', this._mouseFn);
  }

  setJoints(j) {
    if (j) this.mouseBackup.lastPose = Date.now();
    this.avatar.setJoints(j);
  }

  // Loop único: o jogo puxa as articulações + hook de frame (ex: esqueletinho PiP)
  setJointsProvider(fn) { this._provider = fn; }
  setFrameHook(fn) { this._frameHook = fn; }

  async start() {
    this.saves = 0; this.goals = 0; this.level = 1;
    this.state = 'countdown';
    this.running = true;
    this.clock.start();
    this.countStep = 0;
    this.countTimer = 0;
    this.spawnTimer = 0;
    sounds.whistle();
    this.ev.onHud?.(this.stats());
    this.loop();
  }

  stop() { this.running = false; }

  stats() {
    return {
      saves: this.saves, goals: this.goals, level: this.level,
      best: Math.max(storage.best('goalkeeper'), storage.legacyBest())
    };
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Detecção colada no render: puxa articulações frescas todo frame
    try {
      const joints = this._provider ? this._provider() : null;
      if (joints) this.mouseBackup.lastPose = Date.now();
      this.avatar.setJoints(joints);
    } catch {}
    try { this._frameHook?.(); } catch {}

    if (this.state === 'countdown') {
      this.countTimer += dt;
      const seq = ['3️⃣', '2️⃣', '1️⃣', 'JÁ! ⚽'];
      const idx = Math.min(Math.floor(this.countTimer / 0.7), 3);
      if (idx !== this.countStep) { this.countStep = idx; sounds.countdown(); this.ev.onMsg?.(seq[idx]); }
      if (this.countTimer > 2.9) { this.state = 'playing'; sounds.go(); this.ev.onMsg?.('Defenda! 🧤'); this.spawnTimer = 1.0; }
    } else if (this.state === 'playing') {
      this.spawnTimer -= dt;
      const activeBalls = this.balls.filter(b => b.active);
      const wantBalls = this.level >= 4 ? 2 : 1;
      if (this.spawnTimer <= 0 && activeBalls.length < wantBalls) {
        const b = this.balls.find(b => !b.active);
        if (b) {
          b.shoot(this.level);
          sounds.kick();
          this.target.position.copy(b.to);
          this.target.visible = true;
          setTimeout(() => (this.target.visible = false), 600);
        }
        this.spawnTimer = Math.max(0.7, 1.8 - this.level * 0.15);
      }
      // atualiza bolas + colisão HITBOX
      for (const ball of this.balls) {
        if (!ball.active) continue;
        const st = ball.update(dt);
        if (ball.pos.z < 2.2) this.checkSave(ball);
        if (st === 'arrived' && !ball.saved) this.onConceded(ball);
      }
    }

    // mouse fallback injeta luvas quando sem pose
    if (this.mouseBackup.active && Date.now() - this.mouseBackup.lastPose > 2500) {
      this.avatar.pose.lWr.x = this.mouseBackup.x - 0.35;
      this.avatar.pose.lWr.y = this.mouseBackup.y;
      this.avatar.pose.rWr.x = this.mouseBackup.x + 0.35;
      this.avatar.pose.rWr.y = this.mouseBackup.y;
      this.avatar.applyPose();
    }

    this.avatar.update(this.state === 'playing' ? dt : dt * 0.5);
    this.particles.update(dt);
    // screen shake: gol sofrido balança a câmera!
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.45;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * s,
        this.camBase.y + (Math.random() - 0.5) * s,
        this.camBase.z
      );
    } else {
      this.camera.position.copy(this.camBase);
    }
    this.renderer.render(this.scene, this.camera);
  };

  checkSave(ball) {
    if (ball.saved) return;
    const boxes = this.avatar.getHitboxes();
    for (const hb of boxes) {
      if (hb.pos.distanceTo(ball.pos) < hb.r + 0.22) {
        ball.saved = true;
        ball.hide();
        this.saves++;
        this.level = 1 + Math.floor(this.saves / 3);
        sounds.save();
        this.shake = Math.max(this.shake, 0.12); // micro-tremor de impacto
        this.particles.burst(ball.pos, 70);
        this.ev.onHud?.(this.stats());
        this.ev.onPop?.('🧤 DEFESA!');
        if (this.saves % 2 === 0) cheer(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
        else this.ev.onMsg?.(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
        return;
      }
    }
  }

  onConceded(ball) {
    ball.hide();
    // fora do gol = nem conta (raro, alvo sempre dentro)
    if (Math.abs(ball.to.x) > GOAL_W / 2 || ball.to.y > GOAL_H || ball.to.y < 0) {
      this.ev.onMsg?.('Pra fora! Ufa! 😅');
      return;
    }
    this.goals++;
    sounds.goal();
    this.shake = 0.5; // câmera balança no gol sofrido
    this.particles.burst(new THREE.Vector3(ball.to.x, ball.to.y, 0.3), 25, [0x94a3b8, 0xcbd5e1]);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.('⚽ GOL...');
    cheer(COMFORT[Math.floor(Math.random() * COMFORT.length)]);
    storage.saveBest('goalkeeper', this.saves);
    if (this.goals >= 3) {
      this.state = 'over';
      setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
    } else {
      this.ev.onMsg?.(`Gol ${this.goals}/3 — bora defender! 🧤`);
    }
  }
}
