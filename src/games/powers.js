// 🪄 Poderes da Voz — GRITE pra carregar, diga FOGO!/GELO!/RAIO! pra disparar.
// A magia sai da mão levantada e caça o orbe mais próximo. Sem mic = modo
// respiração (carga sozinha) + clique dispara. 60 segundos, recorde salvo.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { buildStadium } from '../game/stadium.js';
import { Avatar3D } from '../game/avatar3d.js';
import { Particles3D } from '../game/particles3d.js';
import { sounds } from '../engine/audio.js';
import { storage } from '../engine/storage.js';
import { voice } from '../engine/voice.js';
import { ELEMENTS, ELEMENT_IDS, chargeStep, pointsFor } from './powersLogic.js';

const TIME_S = 60;
const ORB_N = 4;

export class PowersGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 2.1, -4.0);
    this.camera.lookAt(0, 1.4, 7);
    this.camBase = this.camera.position.clone();
    this.shake = 0;

    const { updateCrowd, clouds } = buildStadium(this.scene);
    this.updateCrowd = updateCrowd;
    this.clouds = clouds;
    this.crowdExcite = 1;
    this.avatar = new Avatar3D(this.scene, { number: '7' });
    this.particles = new Particles3D(this.scene);

    // esfera de energia na mão (cor = elemento, tamanho = carga)
    this.chargeBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 18, 14),
      new THREE.MeshStandardMaterial({
        color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 1.6,
        transparent: true, opacity: 0.9
      })
    );
    this.chargeBall.visible = false;
    this.scene.add(this.chargeBall);

    // orbes-alvo flutuantes (cada um tem um elemento: combine pra +2!)
    this.orbs = [];
    for (let i = 0; i < ORB_N; i++) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf97316, emissiveIntensity: 1.1, roughness: 0.3 })
      );
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.25 })
      );
      core.castShadow = true;
      const g = new THREE.Group();
      g.add(core, shell);
      this.scene.add(g);
      this.orbs.push({ g, core, shell, active: true, el: 'fogo', base: new THREE.Vector3(), ph: Math.random() * 9, respawn: 0 });
      this.placeOrb(this.orbs[i], true);
    }

    // projéteis (magia com rabo de faísca via partículas no disparo)
    this.shots = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf97316, emissiveIntensity: 2 })
      );
      m.visible = false;
      this.scene.add(m);
      this.shots.push({ m, active: false, target: null, el: 'fogo', power: 0 });
    }

    this.score = 0; this.casts = 0; this.level = 1;
    this.charge = 0; this.element = 'fogo'; this.elIdx = 0;
    this.timeLeft = TIME_S;
    this.state = 'idle';
    this._provider = null;
    this._frameHook = null;
    this.clock = new THREE.Clock();
    this.msgT = 0;
    this.running = false;
    this.mouseBackup = { x: 0, y: 1.3, active: false, lastPose: 0 };
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.bindMouseFallback();
    // clique = disparo (fallback sem mic / sem palavra)
    this._clickFn = () => { if (this.state === 'playing') this.cast(this.element); };
    this.canvas.addEventListener('click', this._clickFn);
    voice.onWord((el) => {
      if (this.state !== 'playing') return;
      this.element = el;
      this.paintCharge();
      this.cast(el);
    });
  }

  placeOrb(o, initial = false) {
    o.base.set(
      (Math.random() - 0.5) * 5,
      0.9 + Math.random() * 1.3,
      4 + Math.random() * 4
    );
    o.el = ELEMENT_IDS[Math.floor(Math.random() * ELEMENT_IDS.length)];
    const col = ELEMENTS[o.el].color;
    o.core.material.emissive.setHex(col);
    o.shell.material.color.setHex(col);
    o.g.position.copy(o.base);
    o.g.visible = true;
    o.active = true;
    if (!initial) {
      o.g.scale.setScalar(0.01);
      gsap.to(o.g.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2)' });
    }
  }

  paintCharge() {
    const col = ELEMENTS[this.element].color;
    this.chargeBall.material.color.setHex(col);
    this.chargeBall.material.emissive.setHex(col);
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
    voice.stop();
    window.removeEventListener('resize', this.onResize);
    if (this._mouseFn) window.removeEventListener('mousemove', this._mouseFn);
    if (this._clickFn) this.canvas.removeEventListener('click', this._clickFn);
    try { this.renderer.dispose(); } catch {}
  }

  bindMouseFallback() {
    this._mouseFn = (e) => {
      if (Date.now() - this.mouseBackup.lastPose < 2500) return;
      const nx = (e.clientX / innerWidth - 0.5);
      const ny = 1 - e.clientY / innerHeight;
      this.mouseBackup.x = -nx * 7;
      this.mouseBackup.y = 0.3 + ny * 2.2;
      this.mouseBackup.active = true;
    };
    window.addEventListener('mousemove', this._mouseFn);
  }

  setJointsProvider(fn) { this._provider = fn; }
  setFrameHook(fn) { this._frameHook = fn; }

  async start() {
    this.score = 0; this.casts = 0; this.level = 1;
    this.charge = 0; this.timeLeft = TIME_S;
    this.state = 'countdown';
    this.running = true;
    this.clock.start();
    this.countStep = 0;
    this.countTimer = 0;
    sounds.whistle();
    this.ev.onHud?.(this.stats());
    this.ev.onMsg?.('🎤 Ativando microfone...');
    // mic é async e pode falhar: o jogo começa igual (fallback cobre)
    voice.ensure().then(ok => {
      if (this.state === 'idle') return;
      this.ev.onMsg?.(ok ? '🎤 GRITE pra carregar! Diga FOGO, GELO ou RAIO!' : '🚫 Sem mic: carga sozinha + CLIQUE dispara!');
    });
    this.loop();
  }

  stop() { this.running = false; }

  stats() {
    return {
      saves: this.score, goals: this.casts, level: this.level,
      best: Math.max(storage.best('powers'), 0)
    };
  }

  handPos() {
    // mão mais alta = mão da magia
    const p = this.avatar.pose;
    const h = p.lWr.y > p.rWr.y ? p.lWr : p.rWr;
    return new THREE.Vector3(h.x, h.y, h.z + 0.3);
  }

  cast(el) {
    if (this.charge < 0.2) {
      this.ev.onMsg?.('🔋 Fraco... GRITE mais alto!');
      return;
    }
    const s = this.shots.find(s => !s.active);
    if (!s) return;
    // mira: orbe ativo mais próximo da mão
    const hp = this.handPos();
    let best = null, bestD = 1e9;
    for (const o of this.orbs) {
      if (!o.active) continue;
      const d = o.g.position.distanceTo(hp);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) return;
    s.active = true;
    s.target = best;
    s.el = el;
    s.power = this.charge;
    s.m.material.emissive.setHex(ELEMENTS[el].color);
    s.m.position.copy(hp);
    s.m.visible = true;
    this.casts++;
    this.charge = 0;
    sounds.pew();
    this.particles.burst(hp, 20, [ELEMENTS[el].color, 0xffffff]);
    // sem mic, o elemento roda a cada disparo
    if (!voice.hasMic) {
      this.elIdx = (this.elIdx + 1) % ELEMENT_IDS.length;
      this.element = ELEMENT_IDS[this.elIdx];
      this.paintCharge();
    }
    this.ev.onHud?.(this.stats());
  }

  popOrb(o, el, power) {
    o.active = false;
    o.g.visible = false;
    o.respawn = 0.8;
    const match = o.el === el;
    const crit = power >= 0.99;
    const pts = pointsFor(match, crit);
    this.score += pts;
    this.level = 1 + Math.floor(this.score / 8);
    sounds.ding();
    this.shake = Math.max(this.shake, 0.12);
    this.crowdExcite = 3;
    this.particles.burst(o.g.position.clone(), 70, [ELEMENTS[el].color, 0xffffff]);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.(crit ? '💥 CRÍTICO! +' + pts : match ? `${ELEMENTS[el].emoji} COMBO! +${pts}` : `+${pts}`);
  }

  finish() {
    this.state = 'over';
    storage.saveBest('powers', this.score);
    this.ev.onHud?.(this.stats());
    setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    try {
      const joints = this._provider ? this._provider() : null;
      if (joints) this.mouseBackup.lastPose = Date.now();
      this.avatar.setJoints(joints);
    } catch {}
    try { this._frameHook?.(); } catch {}

    if (this.state === 'countdown') {
      this.countTimer += dt;
      const seq = ['3️⃣', '2️⃣', '1️⃣', 'GRITA! 🎤'];
      const idx = Math.min(Math.floor(this.countTimer / 0.7), 3);
      if (idx !== this.countStep) { this.countStep = idx; sounds.countdown(); this.ev.onMsg?.(seq[idx]); }
      if (this.countTimer > 2.9) { this.state = 'playing'; sounds.go(); }
    } else if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.finish(); }
      // CARGA: grito enche, silêncio esvazia (sem mic: respiração mágica)
      const rms = voice.hasMic ? voice.level() : -1;
      this.charge = rms >= 0
        ? chargeStep(this.charge, rms, voice.threshold(), dt)
        : Math.min(1, this.charge + dt * 0.35);
      // carga máxima = dispara sozinho!
      if (this.charge >= 1) {
        this.cast(this.element);
        if (this.state === 'playing') this.ev.onMsg?.('💥 MÁXIMO!');
      }
      // barra de carga (sem spam: 4x por segundo)
      this.msgT += dt;
      if (this.msgT > 0.25) {
        this.msgT = 0;
        const bar = '▓'.repeat(Math.round(this.charge * 8)).padEnd(8, '░');
        const t = Math.ceil(this.timeLeft);
        this.ev.onMsg?.(`${ELEMENTS[this.element].emoji} ${bar} ${t}s`);
      }
      // orbes flutuam + renascem
      const sp = 1 + (this.level - 1) * 0.25;
      const t = this.clock.elapsedTime;
      for (const o of this.orbs) {
        if (!o.active) {
          o.respawn -= dt;
          if (o.respawn <= 0) this.placeOrb(o);
          continue;
        }
        o.g.position.set(
          o.base.x + Math.sin(t * 1.3 * sp + o.ph) * 0.5,
          o.base.y + Math.sin(t * 2.1 * sp + o.ph * 2) * 0.25,
          o.base.z
        );
        o.g.rotation.y += dt * 1.5;
      }
      // projéteis caçam o alvo
      for (const s of this.shots) {
        if (!s.active) continue;
        if (!s.target.active) {
          s.active = false; s.m.visible = false;
          continue;
        }
        const tp = s.target.g.position;
        const d = tp.clone().sub(s.m.position);
        const dist = d.length();
        if (dist < 0.5) {
          s.active = false; s.m.visible = false;
          this.popOrb(s.target, s.el, s.power);
          continue;
        }
        s.m.position.addScaledVector(d.normalize(), Math.min(dist, 9 * dt));
      }
    }

    if (this.mouseBackup.active && Date.now() - this.mouseBackup.lastPose > 2500) {
      this.avatar.pose.lWr.x = this.mouseBackup.x - 0.35;
      this.avatar.pose.lWr.y = this.mouseBackup.y;
      this.avatar.pose.rWr.x = this.mouseBackup.x + 0.35;
      this.avatar.pose.rWr.y = this.mouseBackup.y;
      this.avatar.applyPose();
    }

    // esfera de energia segue a mão da magia
    if (this.state === 'playing' && this.charge > 0.05) {
      const hp = this.handPos();
      this.chargeBall.visible = true;
      this.chargeBall.position.copy(hp);
      const wob = this.charge > 0.7 ? (Math.random() - 0.5) * 0.08 : 0;
      this.chargeBall.position.x += wob;
      this.chargeBall.position.y += wob;
      this.chargeBall.scale.setScalar(0.4 + this.charge * 1.6);
    } else {
      this.chargeBall.visible = false;
    }

    this.avatar.update(this.state === 'playing' ? dt : dt * 0.5);
    this.particles.update(dt);
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
}
