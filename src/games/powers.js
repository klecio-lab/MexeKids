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
import { ELEMENTS, ELEMENT_IDS, CAST_COOLDOWN, pointsFor } from './powersLogic.js';

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
    // clarão que segue a magia + anéis de choque (reusados, sem alocar em jogo)
    this.flash = new THREE.PointLight(0xffffff, 0, 18);
    this.scene.add(this.flash);
    this.flashEl = document.getElementById('flash');
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.42, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
      );
      r.visible = false;
      this.scene.add(r);
      this.rings.push(r);
    }

    // orbes-alvo flutuantes (cada um tem um elemento: combine pra +2!)
    this.orbs = [];
    for (let i = 0; i < ORB_N; i++) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf97316, emissiveIntensity: 1.6, roughness: 0.3 })
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

    // projéteis: núcleo parrudo + halo aditivo + RASTRO de luz (zero lixo por frame)
    this.shots = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 18, 14),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf97316, emissiveIntensity: 2.4 })
      );
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.add(glow);
      m.visible = false;
      this.scene.add(m);
      const trailN = 16;
      const trailPos = new Float32Array(trailN * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
        color: 0xf97316, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      trail.visible = false;
      trail.frustumCulled = false;
      this.scene.add(trail);
      this.shots.push({ m, glow, trail, trailPos, trailN, active: false, vel: new THREE.Vector3(0, 0, 1), el: 'fogo', life: 0 });
    }

    this.score = 0; this.casts = 0; this.level = 1;
    this.element = 'fogo'; this.elIdx = 0;
    this.cool = 0; // recarga entre disparos (falar 1x = 1 tiro!)
    this.prevHand = null;
    this.handVel = new THREE.Vector3();
    this.hitstop = 0;
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
      this.ev.onMsg?.(ok ? '🎤 Diga FOGO, GELO ou RAIO — 1x e a magia SAI DA MÃO!' : '🚫 Sem mic: aponte a mão e CLIQUE pra disparar!');
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

  // onda de choque visível (anel que abre + some)
  shock(pos, colorHex, big = 1) {
    const r = this.rings.find(r => !r.visible) || this.rings[0];
    r.position.copy(pos);
    r.lookAt(this.camera.position);
    r.material.color.setHex(colorHex);
    r.material.opacity = 0.95;
    r.scale.setScalar(0.3);
    r.visible = true;
    gsap.to(r.scale, { x: 2.6 * big, y: 2.6 * big, z: 1, duration: 0.45, ease: 'power2.out', overwrite: true });
    gsap.to(r.material, { opacity: 0, duration: 0.45, overwrite: true, onComplete: () => { r.visible = false; } });
  }

  cast(el) {
    if (this.cool > 0) return; // recarregando...
    const s = this.shots.find(s => !s.active);
    if (!s) return;
    // MIRA PELA MÃO: arremesso (mão rápida) aponta; mão parada = pra frente
    const hp = this.handPos();
    const dir = new THREE.Vector3(0, 0.06, 1);
    if (this.handVel.length() > 1.5) {
      dir.copy(this.handVel).normalize();
      dir.z = Math.max(dir.z, 0.25); // sempre um pouco pra frente (pros orbes!)
      dir.normalize();
    }
    s.active = true;
    s.vel.copy(dir);
    s.el = el;
    s.life = 2.5;
    s.m.material.emissive.setHex(ELEMENTS[el].color);
    s.glow.material.color.setHex(ELEMENTS[el].color);
    s.trail.material.color.setHex(ELEMENTS[el].color);
    s.m.position.copy(hp);
    s.m.visible = true;
    for (let i = 0; i < s.trailN; i++) {
      s.trailPos[i * 3] = hp.x; s.trailPos[i * 3 + 1] = hp.y; s.trailPos[i * 3 + 2] = hp.z;
    }
    s.trail.geometry.attributes.position.needsUpdate = true;
    s.trail.visible = true;
    this.casts++;
    this.cool = CAST_COOLDOWN;
    sounds.pew();
    // SAÍDA DA MÃO: clarão + anel + faíscas na palma!
    this.flash.position.copy(hp);
    this.flash.color.setHex(ELEMENTS[el].color);
    this.flash.intensity = 50;
    this.shock(hp, ELEMENTS[el].color, 1.0);
    this.particles.burst(hp, 40, [ELEMENTS[el].color, 0xffffff]);
    this.shake = Math.max(this.shake, 0.1);
    // sem mic, o elemento roda a cada disparo
    if (!voice.hasMic) {
      this.elIdx = (this.elIdx + 1) % ELEMENT_IDS.length;
      this.element = ELEMENT_IDS[this.elIdx];
      this.paintCharge();
    }
    this.ev.onHud?.(this.stats());
  }

  killShot(s) {
    s.active = false;
    s.m.visible = false;
    s.trail.visible = false;
  }

  popOrb(o, el) {
    o.active = false;
    o.g.visible = false;
    o.respawn = 0.8;
    const match = o.el === el;
    const pts = pointsFor(match, true); // falar 1x = poder sempre CHEIO
    this.score += pts;
    this.level = 1 + Math.floor(this.score / 8);
    sounds.ding();
    this.hitstop = 0.08; // micro-pausa = "peso" da explosão
    this.shake = 0.25;
    this.crowdExcite = 3;
    // EXPLOSÃO PARRUDA: clarão + flash na tela + anel duplo + chuva de faísca
    const pos = o.g.position.clone();
    this.flash.position.copy(pos);
    this.flash.color.setHex(ELEMENTS[el].color);
    this.flash.intensity = 90;
    if (this.flashEl) {
      this.flashEl.style.opacity = 0.45;
      gsap.to(this.flashEl, { opacity: 0, duration: 0.35, overwrite: true });
    }
    this.shock(pos, ELEMENTS[el].color, 1.6);
    this.shock(pos, 0xffffff, 1.0);
    this.particles.burst(pos, 120, [ELEMENTS[el].color, 0xffffff]);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.(match ? `${ELEMENTS[el].emoji} COMBO! +${pts}` : `💥 +${pts}`);
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
      const seq = ['3️⃣', '2️⃣', '1️⃣', 'MAGIA! 🪄'];
      const idx = Math.min(Math.floor(this.countTimer / 0.7), 3);
      if (idx !== this.countStep) { this.countStep = idx; sounds.countdown(); this.ev.onMsg?.(seq[idx]); }
      if (this.countTimer > 2.9) { this.state = 'playing'; sounds.go(); }
    } else if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.finish(); }
      this.cool = Math.max(0, this.cool - dt);
      // velocidade da mão (gesto de ARREMESSO = mira!)
      const hp = this.handPos();
      if (this.prevHand && dt > 0) {
        const v = hp.clone().sub(this.prevHand).divideScalar(dt);
        this.handVel.lerp(v, 0.5);
      }
      this.prevHand = hp.clone();
      // recado (sem spam: 4x por segundo)
      this.msgT += dt;
      if (this.msgT > 0.25) {
        this.msgT = 0;
        const t = Math.ceil(this.timeLeft);
        const el = ELEMENTS[this.element].emoji;
        this.ev.onMsg?.(voice.hasMic
          ? `${el} Aponte a mão e diga ${this.element.toUpperCase()}! ${t}s`
          : `${el} Aponte a mão e CLIQUE! ${t}s`);
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
        o.g.scale.setScalar(1 + Math.sin(t * 4 + o.ph) * 0.1); // orbe "respira"
      }
      // magia voa pra onde a mão APONTOU (com leve ajuda pra não frustrar)
      for (const s of this.shots) {
        if (!s.active) continue;
        s.life -= dt;
        if (s.life <= 0) { this.killShot(s); continue; }
        // assistência: curva suave pro orbe mais alinhado (cone de ~30°)
        let best = null, bestA = 0.5;
        for (const o of this.orbs) {
          if (!o.active) continue;
          const to = o.g.position.clone().sub(s.m.position).normalize();
          const a = to.angleTo(s.vel);
          if (a < bestA) { bestA = a; best = o; }
        }
        if (best) {
          const to = best.g.position.clone().sub(s.m.position).normalize();
          s.vel.lerp(to, Math.min(1, 3 * dt)).normalize();
        }
        s.m.position.addScaledVector(s.vel, 10 * dt);
        // personalidade por elemento: fogo tremula, gelo gira, raio zigzagueia!
        const ft = this.clock.elapsedTime;
        if (s.el === 'fogo') s.m.scale.setScalar(1 + Math.sin(ft * 40) * 0.15);
        else if (s.el === 'gelo') { s.m.rotation.x += dt * 9; s.m.rotation.y += dt * 6; }
        else { s.m.position.x += (Math.random() - 0.5) * 0.09; s.m.position.y += (Math.random() - 0.5) * 0.09; }
        // rastro de luz acompanha
        s.trailPos.copyWithin(0, 3);
        s.trailPos[(s.trailN - 1) * 3] = s.m.position.x;
        s.trailPos[(s.trailN - 1) * 3 + 1] = s.m.position.y;
        s.trailPos[(s.trailN - 1) * 3 + 2] = s.m.position.z;
        s.trail.geometry.attributes.position.needsUpdate = true;
        // clarão viaja junto com a magia
        if (this.flash.intensity < 12) {
          this.flash.position.copy(s.m.position);
          this.flash.color.setHex(ELEMENTS[s.el].color);
          this.flash.intensity = 12;
        }
        // acertou algum orbe? (generoso: 0.65)
        for (const o of this.orbs) {
          if (!o.active) continue;
          if (o.g.position.distanceTo(s.m.position) < 0.65) {
            this.killShot(s);
            this.popOrb(o, s.el);
            break;
          }
        }
      }
    }

    if (this.mouseBackup.active && Date.now() - this.mouseBackup.lastPose > 2500) {
      this.avatar.pose.lWr.x = this.mouseBackup.x - 0.35;
      this.avatar.pose.lWr.y = this.mouseBackup.y;
      this.avatar.pose.rWr.x = this.mouseBackup.x + 0.35;
      this.avatar.pose.rWr.y = this.mouseBackup.y;
      this.avatar.applyPose();
    }

    // bolinha pronta na mão (cheia + latejando = pode disparar!) + clarão apaga
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 260);
    if (this.state === 'playing') {
      const hp = this.handPos();
      this.chargeBall.visible = true;
      this.chargeBall.position.copy(hp);
      const ready = this.cool <= 0 ? 1 : 1 - this.cool / CAST_COOLDOWN;
      const pulse = this.cool <= 0 ? Math.sin(this.clock.elapsedTime * 8) * 0.12 : 0;
      this.chargeBall.scale.setScalar(0.6 + ready * 1.4 + pulse);
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
