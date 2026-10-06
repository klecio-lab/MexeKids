// Gerente do Jogo do Goleiro 3D — loop, colisão hitbox x bola, placar
import * as THREE from 'three';
import { gsap } from 'gsap';
import { buildStadium } from './stadium.js';
import { loadKicker } from './gobkit.js';
import { Avatar3D } from './avatar3d.js';
import { Ball3D } from './ball.js';
import { Particles3D } from './particles3d.js';
import { GOAL_W, GOAL_H } from '../vision/tracking.js';
import { sounds } from '../engine/audio.js';
import { storage } from '../engine/storage.js';

const CHEERS = ['Demais! 🧤', 'Que defesa! ⭐', 'Você é incrível!', 'Goleiro mágico! ✨'];

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

export class GoalkeeperGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    // Câmera DENTRO do gol, por trás do goleiro: você VÊ as costas do boneco
    // e a bola nasce pequena lá no campo e cresce vindo na sua cara.
    // Direita/esquerda 1:1, sem espelho.
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 2.1, -4.0);
    this.camera.lookAt(0, 1.25, 7);
    this.camBase = this.camera.position.clone();
    this.shake = 0;

    const { updateCrowd, clouds } = buildStadium(this.scene);
    this.updateCrowd = updateCrowd;
    this.clouds = clouds;
    this.crowdExcite = 1;
    this.avatar = new Avatar3D(this.scene);
    // batedor de pênalti (minion animado; se falhar, o jogo segue igual)
    this.kicker = null;
    this.kickerTargetX = 0;
    loadKicker(this.scene).then(k => { this.kicker = k; }).catch(() => {});
    // flash branco do save + textos flutuantes "+1"
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
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    // HITSTOP: congela o mundo 90ms no save (o cérebro lê como "peso"!)
    if (this.hitstop > 0) {
      this.hitstop -= rawDt;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const dt = rawDt;

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
          // batedor alterna o lado e a bola sai DO PÉ dele (leitura perfeita!)
          if (this.kicker) {
            this.kickerSide = -(this.kickerSide || 1);
            this.kickerTargetX = this.kickerSide * 1.7;
            b.shoot(this.level, this.kickerTargetX + (Math.random() - 0.5) * 0.6);
            this.kicker.kick();
          } else {
            b.shoot(this.level);
          }
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
    // batedor: desliza p/ a bola + anima
    if (this.kicker) {
      const gx = this.kicker.group.position.x;
      this.kicker.setX(gx + (this.kickerTargetX - gx) * Math.min(1, dt * 3));
      this.kicker.update(dt);
    }
    // torcida pula (acalma depois do gol/defesa) + nuvens à deriva
    this.crowdExcite = Math.max(1, this.crowdExcite - dt * 1.1);
    try { this.updateCrowd(this.clock.elapsedTime, 0.05 * this.crowdExcite); } catch {}
    for (const c of this.clouds) {
      c.position.x += dt * 0.35;
      if (c.position.x > 34) c.position.x = -34;
    }
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

  spawnFloat(pos) {
    const sp = this.floats.find(s => !s.visible) || this.floats[0];
    sp.position.copy(pos);
    sp.position.y += 0.4;
    sp.material.opacity = 1;
    sp.visible = true;
    gsap.to(sp.position, { y: sp.position.y + 0.9, duration: 0.9, ease: 'power1.out', overwrite: true });
    gsap.to(sp.material, { opacity: 0, duration: 0.9, overwrite: true, onComplete: () => { sp.visible = false; } });
  }

  checkSave(ball) {
    if (ball.saved) return;
    const boxes = this.avatar.getHitboxes();
    for (const hb of boxes) {
      if (hb.pos.distanceTo(ball.pos) < hb.r + 0.22) {
        ball.saved = true;
        this.saves++;
        this.level = 1 + Math.floor(this.saves / 3);
        sounds.save();
        this.shake = Math.max(this.shake, 0.12); // micro-tremor de impacto
        // SUCO sincronizado no frame do contato: hitstop + flash + squash + "+1"
        this.hitstop = 0.09;
        if (this.flashEl) {
          this.flashEl.style.opacity = 0.7;
          gsap.to(this.flashEl, { opacity: 0, duration: 0.3, overwrite: true });
        }
        gsap.fromTo(ball.mesh.scale,
          { x: 1.5, y: 0.55, z: 1.5 },
          { x: 1, y: 1, z: 1, duration: 0.35, ease: 'elastic.out(1,0.5)' });
        setTimeout(() => ball.hide(), 140);
        this.spawnFloat(ball.pos);
        this.crowdExcite = 3; // torcida pula!
        this.particles.burst(ball.pos, 70);
        this.ev.onHud?.(this.stats());
        this.ev.onPop?.('🧤 DEFESA!');
        this.ev.onMsg?.(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
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
    this.crowdExcite = 2.2; // torcida adversária pula junto 😅
    this.particles.burst(new THREE.Vector3(ball.to.x, ball.to.y, 0.3), 25, [0x94a3b8, 0xcbd5e1]);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.('⚽ GOL...');
    storage.saveBest('goalkeeper', this.saves);
    if (this.goals >= 3) {
      this.state = 'over';
      setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
    } else {
      this.ev.onMsg?.(`Gol ${this.goals}/3 — bora defender! 🧤`);
    }
  }
}
