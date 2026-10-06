// 🔥 Queimado Maluco — goleiro INVERTIDO: as boladas vêm NO corpo!
// Desviou = ponto (raspou = +2!); encostou = perde vida (3 vidas).
// Reusa: Avatar3D + hitboxes, Ball3D, stadium, kicker, sucos do goleiro.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { buildDodgeArena } from '../game/arena.js';
import { loadKicker } from '../game/gobkit.js';
import { Avatar3D } from '../game/avatar3d.js';
import { Ball3D } from '../game/ball.js';
import { Particles3D } from '../game/particles3d.js';
import { GOAL_W } from '../vision/tracking.js';
import { sounds } from '../engine/audio.js';
import { storage } from '../engine/storage.js';
import { scoreFor } from './dodgeLogic.js';

const CHEERS = ['UFA! 💨', 'Desviou! ⭐', 'Que reflexo!', 'Ninja! 🥷'];
const OUCH = ['AI! 😅', 'PEGYYY! 🔥', 'Na próxima desvia!'];

function floatTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 80px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#15803d';
  g.strokeText(text, 128, 66);
  g.fillStyle = '#ffffff';
  g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const LIVES = 3;

export class DodgeGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    // mesma câmera do goleiro: dentro do gol, vendo as costas do boneco
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 2.1, -4.0);
    this.camera.lookAt(0, 1.25, 7);
    this.camBase = this.camera.position.clone();
    this.shake = 0;

    const { updateCrowd, clouds } = buildDodgeArena(this.scene);
    this.updateCrowd = updateCrowd;
    this.clouds = clouds;
    this.crowdExcite = 1;
    this.avatar = new Avatar3D(this.scene, { number: '2' });
    this.kicker = null;
    this.kickerTargetX = 0;
    loadKicker(this.scene).then(k => { this.kicker = k; }).catch(() => {});
    this.flashEl = document.getElementById('flash');
    this.hitstop = 0;
    this.floats = [];
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: floatTexture('+1'), transparent: true, depthTest: false
      }));
      sp.scale.set(1.3, 0.65, 1);
      sp.visible = false;
      this.scene.add(sp);
      this.floats.push(sp);
    }
    this.balls = [new Ball3D(this.scene), new Ball3D(this.scene), new Ball3D(this.scene)];
    this.particles = new Particles3D(this.scene);

    // ⚠️ ZONA DE PERIGO: anel dourado onde a bola VAI passar — SAIA DAÍ!
    this.danger = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.danger.visible = false;
    this.scene.add(this.danger);

    this.dodges = 0; this.hits = 0; this.level = 1;
    this.state = 'idle';
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
    this.stop();
    window.removeEventListener('resize', this.onResize);
    if (this._mouseFn) window.removeEventListener('mousemove', this._mouseFn);
    try { this.renderer.dispose(); } catch {}
  }

  bindMouseFallback() {
    this._mouseFn = (e) => {
      if (Date.now() - this.mouseBackup.lastPose < 2500) return;
      const nx = (e.clientX / innerWidth - 0.5);
      const ny = 1 - e.clientY / innerHeight;
      this.mouseBackup.x = -nx * (GOAL_W * 1.1);
      this.mouseBackup.y = 0.3 + ny * 2.2;
      this.mouseBackup.active = true;
    };
    window.addEventListener('mousemove', this._mouseFn);
  }

  setJointsProvider(fn) { this._provider = fn; }
  setFrameHook(fn) { this._frameHook = fn; }

  async start() {
    this.dodges = 0; this.hits = 0; this.level = 1;
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
      saves: this.dodges, goals: this.hits, level: this.level,
      best: Math.max(storage.best('dodge'), 0)
    };
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    if (this.hitstop > 0) {
      this.hitstop -= rawDt;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const dt = rawDt;

    try {
      const joints = this._provider ? this._provider() : null;
      if (joints) this.mouseBackup.lastPose = Date.now();
      this.avatar.setJoints(joints);
    } catch {}
    try { this._frameHook?.(); } catch {}

    if (this.state === 'countdown') {
      this.countTimer += dt;
      const seq = ['3️⃣', '2️⃣', '1️⃣', 'DESVIA! 🔥'];
      const idx = Math.min(Math.floor(this.countTimer / 0.7), 3);
      if (idx !== this.countStep) { this.countStep = idx; sounds.countdown(); this.ev.onMsg?.(seq[idx]); }
      if (this.countTimer > 2.9) { this.state = 'playing'; sounds.go(); this.ev.onMsg?.('Desvia! 🔥'); this.spawnTimer = 1.0; }
    } else if (this.state === 'playing') {
      this.spawnTimer -= dt;
      const activeBalls = this.balls.filter(b => b.active);
      const wantBalls = this.level >= 4 ? 2 : 1;
      if (this.spawnTimer <= 0 && activeBalls.length < wantBalls) {
        const b = this.balls.find(b => !b.active);
        if (b) this.throwAtBody(b);
        this.spawnTimer = Math.max(0.7, 1.8 - this.level * 0.15);
      }
      for (const ball of this.balls) {
        if (!ball.active) continue;
        const st = ball.update(dt);
        // menor distância do corpo durante o voo (= raspou ou passou longe?)
        const boxes = this.avatar.getHitboxes();
        for (const hb of boxes) {
          const d = hb.pos.distanceTo(ball.pos);
          if (d < ball.minDist) ball.minDist = d;
        }
        if (ball.pos.z < 2.2) this.checkHit(ball, boxes);
        if (st === 'arrived' && !ball.resolved) this.onDodged(ball);
      }
    }

    if (this.mouseBackup.active && Date.now() - this.mouseBackup.lastPose > 2500) {
      this.avatar.pose.lWr.x = this.mouseBackup.x - 0.35;
      this.avatar.pose.lWr.y = this.mouseBackup.y;
      this.avatar.pose.rWr.x = this.mouseBackup.x + 0.35;
      this.avatar.pose.rWr.y = this.mouseBackup.y;
      this.avatar.applyPose();
    }

    this.avatar.update(this.state === 'playing' ? dt : dt * 0.5);
    this.particles.update(dt);
    // anel de perigo pulsa na zona + segue a bola mais próxima
    const live = this.balls.find(b => b.active && !b.resolved);
    if (live) {
      this.danger.visible = true;
      this.danger.position.copy(live.to);
      const p = 1 + Math.sin(this.clock.elapsedTime * 10) * 0.12;
      this.danger.scale.setScalar(p);
    } else {
      this.danger.visible = false;
    }
    if (this.kicker) {
      const gx = this.kicker.group.position.x;
      this.kicker.setX(gx + (this.kickerTargetX - gx) * Math.min(1, dt * 3));
      this.kicker.update(dt);
    }
    this.crowdExcite = Math.max(1, this.crowdExcite - dt * 1.1);
    try { this.updateCrowd(this.clock.elapsedTime, 0.05 * this.crowdExcite); } catch {}
    for (const c of this.clouds) {
      c.position.x += dt * 0.35;
      if (c.position.x > 34) c.position.x = -34;
    }
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

  // a bola mira NO CORPO (peito ± aleatório): ficar parado = encostar!
  throwAtBody(b) {
    if (this.kicker) {
      this.kickerSide = -(this.kickerSide || 1);
      this.kickerTargetX = this.kickerSide * 1.7;
      b.shoot(this.level, this.kickerTargetX + (Math.random() - 0.5) * 0.6);
      this.kicker.kick();
    } else {
      b.shoot(this.level);
    }
    const chest = this.avatar.getHitboxes().find(h => h.name === 'peito');
    const cx = chest ? chest.pos.x : 0, cy = chest ? chest.pos.y : 1.2;
    b.to.set(
      Math.max(-GOAL_W / 2 + 0.3, Math.min(GOAL_W / 2 - 0.3, cx + (Math.random() - 0.5) * 1.6)),
      Math.max(0.3, Math.min(2.2, cy + (Math.random() - 0.5) * 1.2)),
      0.3
    );
    b.minDist = 99;
    b.resolved = false;
    sounds.kick();
  }

  spawnFloat(pos) {
    const sp = this.floats.find(s => !s.visible) || this.floats[0];
    sp.position.copy(pos);
    sp.position.y += 0.4;
    sp.material.opacity = 1;
    sp.visible = true;
    gsap.to(sp.position, { y: sp.position.y + 0.9, duration: 0.9, ease: 'power1.out', overwrite: true });
    gsap.to(sp.material, { opacity: 0, duration: 0.9, overwrite: true, onComplete: () => { sp.visible = false; } });
  }

  checkHit(ball, boxes) {
    if (ball.resolved) return;
    for (const hb of boxes) {
      if (hb.pos.distanceTo(ball.pos) < hb.r + 0.22) {
        ball.resolved = true;
        ball.hide();
        this.onHurt(ball.pos);
        return;
      }
    }
  }

  onHurt(pos) {
    this.hits++;
    sounds.smack();
    this.hitstop = 0.09;
    this.shake = 0.5;
    if (this.flashEl) {
      this.flashEl.style.opacity = 0.7;
      gsap.to(this.flashEl, { opacity: 0, duration: 0.3, overwrite: true });
    }
    this.particles.burst(new THREE.Vector3(pos.x, pos.y, 0.3), 50, [0xef4444, 0xf97316]);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.('🔥 PEGYYY!');
    storage.saveBest('dodge', this.dodges);
    if (this.hits >= LIVES) {
      this.state = 'over';
      this.ev.onMsg?.('Fim de jogo! 🔥');
      setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
    } else {
      this.ev.onMsg?.(`${OUCH[Math.floor(Math.random() * OUCH.length)]} ${this.hits}/${LIVES} 💔`);
    }
  }

  onDodged(ball) {
    ball.resolved = true;
    ball.hide();
    const { dodges } = scoreFor(false, ball.minDist);
    this.dodges += dodges;
    this.level = 1 + Math.floor(this.dodges / 3);
    sounds.ding();
    this.crowdExcite = 3;
    this.particles.burst(new THREE.Vector3(ball.to.x, ball.to.y, 0.3), 60, [0x22c55e, 0xa7f3d0]);
    this.spawnFloat(ball.to);
    if (dodges > 1) {
      const p2 = ball.to.clone(); p2.x += 0.7;
      this.spawnFloat(p2);
      this.ev.onPop?.('💨 RASPANDO! +2');
    } else {
      this.ev.onPop?.('💨 UFA! +1');
    }
    this.ev.onHud?.(this.stats());
    this.ev.onMsg?.(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  }
}
