// 🏃 Corrida Maluca — Subway da escola: 3 faixas, desvie, PULE e AGACHE!
// Quadril pro lado = troca de faixa; pulo de verdade = barreira baixa;
// agachar = passa por baixo. Moedas guiam o caminho (arco = PULE AQUI!).
// Teclado (setas) joga sem câmera — ótimo pra testar!
import * as THREE from 'three';
import { gsap } from 'gsap';
import { buildRunnerTrack } from '../game/arena.js';
import { Avatar3D } from '../game/avatar3d.js';
import { Particles3D } from '../game/particles3d.js';
import { sounds } from '../engine/audio.js';
import { storage } from '../engine/storage.js';
import { LANES, LIVES, laneFor, createBody, bodyMoves, hitsPlayer, speedFor, spawnGap } from './runnerLogic.js';

export class RunnerGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    // câmera atrás e acima: vê as costas do corredor + a pista vindo
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    this.camera.position.set(0, 3.4, -6.5);
    this.camera.lookAt(0, 1.2, 10);
    this.camBase = this.camera.position.clone();
    this.shake = 0;

    this.track = buildRunnerTrack(this.scene);
    this.avatar = new Avatar3D(this.scene, { number: '9' });
    this.particles = new Particles3D(this.scene);
    this.flashEl = document.getElementById('flash');
    this.hitstop = 0;

    // moedas (piscina)
    this.coins = [];
    const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 20);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(coinGeo, new THREE.MeshStandardMaterial({
        color: 0xfacc15, emissive: 0xa16207, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.3
      }));
      m.rotation.x = Math.PI / 2;
      m.visible = false;
      m.castShadow = true;
      this.scene.add(m);
      this.coins.push({ m, active: false, lane: 1, z: 0, y: 0.9 });
    }
    // obstáculos (piscina): low = pula, high = agacha, wall = troca de faixa!
    this.obsts = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const barMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 0.35), barMat);
      bar.castShadow = true;
      const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), postMat);
      const p2 = p1.clone();
      g.add(bar, p1, p2);
      g.visible = false;
      this.scene.add(g);
      this.obsts.push({ g, bar, p1, p2, active: false, type: 'low', lane: 1, z: 0, hitDone: false, bottom: 0.45, top: 1.0 });
    }

    this.meters = 0; this.coinCount = 0; this.lives = LIVES; this.level = 1;
    this.lane = 1; // índice 0..2 (meio)
    this.body = createBody();
    this.invuln = 0;
    this.spawnT = 0;
    this.simAir = 0; this.keys = {};
    this.state = 'idle';
    this._provider = null;
    this._frameHook = null;
    this.clock = new THREE.Clock();
    this.msgT = 0;
    this.running = false;
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this._keyFn = (e) => {
      if (e.type === 'keydown') {
        if (e.key === 'ArrowLeft') this.keys.left = true;
        if (e.key === 'ArrowRight') this.keys.right = true;
        if (e.key === 'ArrowDown') this.keys.down = true;
        if (e.key === 'ArrowUp' && !e.repeat && this.simAir <= 0) { this.simAir = 0.75; sounds.go(); }
      } else {
        if (e.key === 'ArrowLeft') this.keys.left = false;
        if (e.key === 'ArrowRight') this.keys.right = false;
        if (e.key === 'ArrowDown') this.keys.down = false;
      }
    };
    window.addEventListener('keydown', this._keyFn);
    window.addEventListener('keyup', this._keyFn);
  }

  shapeObstacle(o) {
    // low: barreira baixa (PULA!) | high: barra alta (AGACHA!) | wall: paredão (SAI DA FAIXA!)
    const cols = { low: 0xf97316, high: 0xa855f7, wall: 0xef4444 };
    o.bar.material.color.setHex(cols[o.type]);
    if (o.type === 'low') {
      // macarrão de piscina: em pé encosta, pulinho de 0.55 limpa!
      o.bottom = 0.25; o.top = 0.5;
      o.bar.scale.set(1, 1, 1); o.bar.position.y = 0.37;
      o.p1.visible = o.p2.visible = true;
      o.p1.scale.y = o.p2.scale.y = 0.15;
      o.p1.position.set(-1.2, 0.09, 0); o.p2.position.set(1.2, 0.09, 0);
    } else if (o.type === 'high') {
      o.bottom = 1.15; o.top = 2.3;
      o.bar.scale.set(1, 1, 1); o.bar.position.y = 1.7;
      o.p1.visible = o.p2.visible = true;
      o.p1.scale.y = o.p2.scale.y = 1;
      o.p1.position.set(-1.2, 1.2, 0); o.p2.position.set(1.2, 1.2, 0);
    } else {
      o.bottom = 0; o.top = 2.4;
      o.bar.scale.set(1, 5.5, 2.2); o.bar.position.y = 1.1;
      o.p1.visible = o.p2.visible = false;
    }
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
    window.removeEventListener('keydown', this._keyFn);
    window.removeEventListener('keyup', this._keyFn);
    try { this.renderer.dispose(); } catch {}
  }

  setJointsProvider(fn) { this._provider = fn; }
  setFrameHook(fn) { this._frameHook = fn; }

  async start() {
    this.meters = 0; this.coinCount = 0; this.lives = LIVES; this.level = 1;
    this.lane = 1; this.body = createBody(); this.invuln = 0;
    this.spawnT = 1.2; this.simAir = 0;
    for (const c of this.coins) { c.active = false; c.m.visible = false; }
    for (const o of this.obsts) { o.active = false; o.g.visible = false; }
    this.state = 'countdown';
    this.running = true;
    this.clock.start();
    this.countStep = 0;
    this.countTimer = 0;
    sounds.whistle();
    this.ev.onHud?.(this.stats());
    this.loop();
  }

  stop() { this.running = false; }

  stats() {
    return {
      saves: this.coinCount, goals: Math.floor(this.meters), level: this.level,
      best: Math.max(storage.best('runner'), 0)
    };
  }

  spawnWave() {
    // 1-2 obstáculos por onda, SEMPRE com saída (faixa livre ou pulável/agachável)
    const types = ['low', 'high', 'wall'];
    const n = this.level >= 3 && Math.random() < 0.5 ? 2 : 1;
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const o = this.obsts.find(o => !o.active);
      if (!o) return;
      o.type = types[Math.floor(Math.random() * (this.level >= 2 ? 3 : 2))];
      o.lane = lanes[i];
      o.z = 34;
      o.hitDone = false;
      this.shapeObstacle(o);
      o.active = true;
      o.g.visible = true;
    }
    // moedas: linha na faixa livre OU arco sobre barreira baixa (ensina a pular!)
    const c0 = this.coins.find(c => !c.active);
    if (c0) {
      const low = this.obsts.find(o => o.active && o.type === 'low' && o.z > 30);
      let idx = 0;
      for (const c of this.coins) {
        if (c.active || idx >= 4) continue;
        c.active = true;
        c.m.visible = true;
        if (low && idx < 4) {
          c.lane = low.lane; // arco sobre a barreira!
          c.z = 30 + idx * 1.6;
          c.y = [0.7, 1.5, 1.5, 0.7][idx];
        } else {
          c.lane = lanes[n % 3];
          c.z = 28 + idx * 1.8;
          c.y = 0.9;
        }
        idx++;
      }
    }
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

    let joints = null;
    try { joints = this._provider ? this._provider() : null; } catch {}
    this.avatar.setJoints(joints);
    try { this._frameHook?.(); } catch {}

    if (this.state === 'countdown') {
      this.countTimer += dt;
      const seq = ['3️⃣', '2️⃣', '1️⃣', 'CORRE! 🏃'];
      const idx = Math.min(Math.floor(this.countTimer / 0.7), 3);
      if (idx !== this.countStep) { this.countStep = idx; sounds.countdown(); this.ev.onMsg?.(seq[idx]); }
      if (this.countTimer > 2.9) { this.state = 'playing'; sounds.go(); this.ev.onMsg?.('Desvia! Pula! Agacha! 🏃'); }
    } else if (this.state === 'playing') {
      const speed = speedFor(this.level);
      this.meters += speed * dt;
      this.level = 1 + Math.floor(this.meters / 150);
      this.track.scroll(dt, speed);

      // CONTROLE: quadril (ou setas) + pulo/agachar de verdade
      let hipX = 0, air = 0, duck = false;
      if (joints && joints.lHip && joints.rHip) {
        hipX = (joints.lHip.x + joints.rHip.x) / 2;
        const mv = bodyMoves(this.body, (joints.lHip.y + joints.rHip.y) / 2,
          joints.nose ? joints.nose.y : 1.5, dt);
        air = mv.jump;
        duck = mv.crouch > 0.12;
      }
      if (this.keys.left) hipX = -1;
      if (this.keys.right) hipX = 1;
      if (this.keys.down) duck = true;
      this.simAir = Math.max(0, this.simAir - dt * 2.2);
      air = Math.max(air, this.simAir);
      // laneFor fala -1/0/1 relativo; this.lane guarda índice 0..2
      this.lane = laneFor(hipX, this.lane - 1) + 1;
      const laneIdx = this.lane;
      const laneX = LANES[laneIdx];

      // boneco corre na faixa (desliza + inclina!) — pulo/agachar vêm do corpo
      const g = this.avatar.group;
      g.position.x += (laneX - g.position.x) * Math.min(1, dt * 10);
      this.avatar.group.rotation.z = (g.position.x - laneX) * -0.18;
      // perninhas de mentira correndo quando sem câmera? (com câmera o corpo manda)
      this.avatar.update(dt);

      this.invuln = Math.max(0, this.invuln - dt);
      g.visible = this.invuln <= 0 || Math.floor(this.clock.elapsedTime * 12) % 2 === 0;

      // spawns
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnWave();
        this.spawnT = spawnGap(this.level);
      }

      // moedas vêm vindo (gira-gira!) + coleta
      const px = g.position.x, py = 0.9 + air;
      for (const c of this.coins) {
        if (!c.active) continue;
        c.z -= speed * dt;
        if (c.z < -3) { c.active = false; c.m.visible = false; continue; }
        c.m.position.set(LANES[c.lane], c.y, c.z);
        c.m.rotation.y += dt * 4;
        if (Math.abs(c.z) < 0.9 && Math.abs(LANES[c.lane] - px) < 0.8 && Math.abs(c.y - py) < 0.9) {
          c.active = false; c.m.visible = false;
          this.coinCount++;
          sounds.ding();
          this.particles.burst(new THREE.Vector3(px, py, 0), 15, [0xfacc15, 0xfff7c2]);
          this.ev.onHud?.(this.stats());
        }
      }

      // obstáculos vêm vindo + batida!
      const pTop = air + (duck ? 1.0 : 1.7), pBot = air;
      for (const o of this.obsts) {
        if (!o.active) continue;
        o.z -= speed * dt;
        if (o.z < -4) { o.active = false; o.g.visible = false; continue; }
        o.g.position.set(LANES[o.lane], 0, o.z);
        if (!o.hitDone && this.invuln <= 0 && hitsPlayer(
          { lane: laneIdx, top: pTop, bottom: pBot }, { lane: o.lane, top: o.top, bottom: o.bottom, z: o.z })) {
          o.hitDone = true;
          this.onHurt();
        }
      }

      this.msgT += dt;
      if (this.msgT > 0.5) {
        this.msgT = 0;
        this.ev.onHud?.(this.stats());
      }
    }

    this.particles.update(dt);
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

  onHurt() {
    this.lives--;
    sounds.smack();
    this.hitstop = 0.09;
    this.shake = 0.4;
    this.invuln = 1.2;
    if (this.flashEl) {
      this.flashEl.style.opacity = 0.7;
      gsap.to(this.flashEl, { opacity: 0, duration: 0.3, overwrite: true });
    }
    this.particles.burst(new THREE.Vector3(this.avatar.group.position.x, 1.2, 0), 50, [0xef4444, 0xf97316]);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.('💥 AI!');
    if (this.lives <= 0) {
      this.state = 'over';
      storage.saveBest('runner', Math.floor(this.meters));
      this.ev.onMsg?.(`Fim de jogo! 🏃 ${Math.floor(this.meters)}m`);
      setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
    } else {
      this.ev.onMsg?.(`AI! 💔 ${this.lives} vidas!`);
    }
  }
}
