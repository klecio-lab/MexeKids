// 🎯 Mira Maluca — galeria de tiro de festa junina (sem violência: balões!).
// Mira com a PONTA DO INDICADOR; 2 armas:
//   🔫 Bolhas (tiro automático)  •  💥 Canhão (pinça 🤏, área, cooldown)
//   ✌️ troca de arma  •  mouse: mira + clique atira, teclas 1/2 trocam.
// Implementa o contrato do hub. Usa GSAP pro "suco" (pops, respawns).
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Particles3D } from '../game/particles3d.js';
import { Avatar3D } from '../game/avatar3d.js';
import { isPeace, isPinch } from '../vision/gestures.js';
import { sounds, cheer } from '../engine/audio.js';
import { storage } from '../engine/storage.js';

const AIM_SPAN = 10;   // largura do plano de mira (mundo -x = direita da tela)
const WALL_Z = 9;
const GAME_S = 60;

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#ef4444' : '#ffffff';
    g.fillRect(i * 32, 0, 32, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

function bannerTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 140;
  const g = c.getContext('2d');
  g.fillStyle = '#7c2d12';
  g.fillRect(0, 0, 1024, 140);
  g.font = '900 76px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fde047';
  g.fillText(text, 512, 74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBooth(scene) {
  scene.background = new THREE.Color(0x1a1040);
  scene.fog = new THREE.Fog(0x1a1040, 22, 50);
  scene.add(new THREE.HemisphereLight(0xfff7ed, 0x1a1040, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 10, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x241a4d })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // parede + toldo listrado + banner
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7 })
  );
  wall.position.set(0, 2.1, WALL_Z);
  wall.rotation.y = Math.PI;
  scene.add(wall);
  const awn = new THREE.Mesh(
    new THREE.BoxGeometry(11.5, 1, 1.6),
    new THREE.MeshStandardMaterial({ map: stripeTexture() })
  );
  awn.position.set(0, 4.6, WALL_Z - 0.5);
  scene.add(awn);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 1.1),
    new THREE.MeshBasicMaterial({ map: bannerTexture('🎯 MIRA MALUCA 🎯'), transparent: true })
  );
  banner.position.set(0, 3.6, WALL_Z - 0.05);
  banner.rotation.y = Math.PI;
  scene.add(banner);

  // prateleiras
  const wood = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 });
  for (const y of [0.95, 1.95]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.12, 0.55), wood);
    shelf.position.set(0, y, WALL_Z - 0.35);
    shelf.castShadow = true;
    scene.add(shelf);
  }

  // balcão da frente
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 1), wood);
  counter.position.set(0, 0.5, 4.5);
  counter.castShadow = true;
  scene.add(counter);

  // bandeirinhas
  const flagCols = [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xec4899];
  for (let i = 0; i < 15; i++) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.4, 4),
      new THREE.MeshBasicMaterial({ color: flagCols[i % flagCols.length], side: THREE.DoubleSide })
    );
    f.position.set(-5.6 + i * 0.8, 5.4 - Math.abs(i - 7) * 0.12, 5.5);
    f.rotation.x = Math.PI;
    scene.add(f);
  }

  // holofote central
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, 8, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfef9c3, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    })
  );
  cone.position.set(0, 5, 4);
  scene.add(cone);
}

// Luva (mundo, metros) -> mira na parede. Pura (testável em Node).
export function mapGloveToAim(gv) {
  return {
    x: Math.max(-4.6, Math.min(4.6, gv.x * 1.05)),
    y: Math.max(0.2, Math.min(2.9, gv.y))
  };
}

// Ponta do indicador -> mundo (p/ decidir QUAL mira a pinça usa)
export function tipWorld(hand) {
  const tip = hand[8];
  return {
    x: (tip.x - 0.5) * AIM_SPAN,
    y: Math.max(0.1, Math.min(3, (1 - tip.y) * 3.4 - 0.2))
  };
}

function makeBalloon(color) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 20, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35 })
  );
  ball.scale.y = 1.15;
  ball.castShadow = true;
  g.add(ball);
  g.userData.ball = ball;
  const knot = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.1, 8),
    new THREE.MeshStandardMaterial({ color })
  );
  knot.position.y = -0.4;
  knot.rotation.x = Math.PI;
  g.add(knot);
  return g;
}

export class ShooterGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    // câmera alta: boneco embaixo no quadro, alvos em cima (estilo over-shoulder)
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 2.6, -3.4);
    this.camera.lookAt(0, 1.3, 8);
    this.camBase = this.camera.position.clone();
    this.shake = 0;

    buildBooth(this.scene);
    this.particles = new Particles3D(this.scene);

    // boneco do jogador (você!): CADA LUVA é uma mira (dual-wield! 🤲)
    this.avatar = new Avatar3D(this.scene);
    this.aimL = { x: -1, y: 1.5 };
    this.aimR = { x: 1, y: 1.5 };
    this.gloveL = new THREE.Vector3(-1, 1.4, 0.2);
    this.gloveR = new THREE.Vector3(1, 1.4, 0.2);
    // linhas de mira: luva -> alvo (a criança VÊ a conexão mão→alvo)
    const makeAimLine = (color) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.35
      }));
      line.frustumCulled = false;
      this.scene.add(line);
      return { line, geo };
    };
    this.aimLineL = makeAimLine(0x22d3ee);
    this.aimLineR = makeAimLine(0x22d3ee);
    // marcas de impacto: mostram ONDE o tiro pegou na parede
    this.marks = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.2, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      m.position.z = WALL_Z - 0.42;
      m.visible = false;
      this.scene.add(m);
      this.marks.push(m);
    }

    // miras: uma por luva!
    const makeCross = () => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.17, 0.24, 28),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true })
      );
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.05, 16),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide })
      );
      dot.position.z = -0.01;
      g.add(ring, dot);
      g.position.set(0, 1.5, WALL_Z - 0.4);
      this.scene.add(g);
      return { group: g, ring, dot };
    };
    this.crossL = makeCross();
    this.crossR = makeCross();

    // alvos: 2 fileiras x 4 balões
    this.targets = [];
    const cols = [0xef4444, 0x3b82f6, 0x22c55e, 0xa855f7];
    const rows = [
      { y: 1.42, points: 1 },
      { y: 2.42, points: 2 }
    ];
    for (const row of rows) {
      [-3.3, -1.1, 1.1, 3.3].forEach((bx, i) => {
        const mesh = makeBalloon(cols[(i + (row.points > 1 ? 2 : 0)) % cols.length]);
        mesh.position.set(bx, row.y, WALL_Z - 0.35);
        this.scene.add(mesh);
        this.targets.push({
          mesh, baseX: bx, y: row.y, phase: Math.random() * 6.28,
          alive: true, respawnT: 0, points: row.points, gold: false
        });
      });
    }
    // balão dourado bônus (aparece de vez em quando, vale 5!)
    this.gold = { mesh: makeBalloon(0xfacc15), alive: false, t: 8, life: 0, phase: 0, baseX: 0 };
    this.gold.mesh.visible = false;
    this.scene.add(this.gold.mesh);

    // tracers (rastro do tiro)
    this.tracers = [];
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0
      }));
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    this._provider = null;
    this._handsProvider = null;
    this._frameHook = null;
    this.clock = new THREE.Clock();
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();

    // entrada mouse/teclado (fallback + teste)
    this.mouse = { x: 0, y: 1.5, active: false, lastHand: 0, clickFire: null };
    this._mouseMove = (e) => {
      if (Date.now() - this.mouse.lastHand < 800) return; // mão real tem prioridade
      const nx = e.clientX / innerWidth - 0.5;
      this.mouse.x = -nx * AIM_SPAN;
      this.mouse.y = Math.max(0.1, Math.min(3, (1 - e.clientY / innerHeight) * 3.4 - 0.2));
      this.mouse.active = true;
    };
    this._mouseDown = () => {
      if (Date.now() - this.mouse.lastHand < 800) return;
      this.mouse.active = true;
      if (this.mouse.clickFire) this.mouse.clickFire();
    };
    this._key = (e) => {
      if (e.code === 'Digit1') this.setWeapon(0);
      if (e.code === 'Digit2') this.setWeapon(1);
    };
    window.addEventListener('mousemove', this._mouseMove);
    window.addEventListener('mousedown', this._mouseDown);
    window.addEventListener('keydown', this._key);

    this.score = 0; this.level = 1;
    this.weapon = 0; // 0 bolhas, 1 canhão (arma vale pras duas mãos)
    this.cannonCool = 0;
    this.fireT = { l: 0, r: 0.17 }; // gatilhos independentes (r começa defasado = alternado!)
    this.peaceCool = 0;
    this.timeLeft = GAME_S;
    this.msgT = 0;
    this.lastWholeSec = -1;
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
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this._mouseMove);
    window.removeEventListener('mousedown', this._mouseDown);
    window.removeEventListener('keydown', this._key);
    for (const t of this.targets) gsap.killTweensOf(t.mesh.scale);
    try { this.renderer.dispose(); } catch {}
  }

  setJointsProvider(fn) { this._provider = fn; }
  setHandsProvider(fn) { this._handsProvider = fn; }
  setFrameHook(fn) { this._frameHook = fn; }
  stats() {
    return {
      saves: this.score, goals: Math.max(0, Math.ceil(this.timeLeft)), level: this.level,
      best: Math.max(storage.best('shooter'), 0)
    };
  }

  setWeapon(w) {
    if (this.weapon === w) return;
    this.weapon = w;
    sounds.click();
    const col = w === 0 ? 0x22d3ee : 0xfb923c;
    for (const c of [this.crossL, this.crossR]) {
      gsap.fromTo(c.group.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
      c.ring.material.color.set(col);
      c.dot.material.color.set(col);
    }
    this.aimLineL.line.material.color.set(col);
    this.aimLineR.line.material.color.set(col);
    this.ev.onMsg?.(w === 0 ? '🔫 Bolhas!' : '💥 Canhão! Pinça 👌 pra atirar!');
  }

  // Posiciona mira + linha de uma luva (visível só se a mão está ativa)
  placeCross(cross, aimLine, aim, glove, show, dt, t) {
    cross.group.visible = show;
    aimLine.line.visible = show;
    if (!show) return;
    cross.group.position.set(aim.x, aim.y, WALL_Z - 0.4);
    cross.group.rotation.z += dt * 2;
    const pulse = 1 + Math.sin(t * 6) * 0.08;
    cross.group.scale.set(pulse, pulse, 1);
    const ap = aimLine.geo.attributes.position.array;
    ap[0] = glove.x; ap[1] = glove.y; ap[2] = glove.z;
    ap[3] = aim.x; ap[4] = aim.y; ap[5] = WALL_Z - 0.4;
    aimLine.geo.attributes.position.needsUpdate = true;
  }

  showMark(x, y, color) {
    const m = this.marks.find(m => !m.visible) || this.marks[0];
    m.position.set(x, y, WALL_Z - 0.42);
    m.material.color.set(color);
    m.visible = true;
    gsap.fromTo(m.scale, { x: 0.4, y: 0.4 }, { x: 1.2, y: 1.2, duration: 0.45, ease: 'power1.out', overwrite: true });
    gsap.fromTo(m.material, { opacity: 0.95 },
      { opacity: 0, duration: 0.45, overwrite: true, onComplete: () => { m.visible = false; } });
  }

  tracer(to, color, big = false, from = null) {
    const t = this.tracers.find(t => t.life <= 0) || this.tracers[0];
    const f = from || this.gloveR; // tiro SAI DA LUVA que atirou (feedback direto!)
    const p = t.line.geometry.attributes.position.array;
    p[0] = f.x; p[1] = f.y; p[2] = f.z;
    p[3] = to.x; p[4] = to.y; p[5] = WALL_Z - 0.4;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.set(color);
    t.line.material.linewidth = big ? 3 : 1;
    t.line.visible = true;
    t.life = 1;
  }

  nearestTarget(aim, r) {
    let best = null, bd = r;
    const consider = (t) => {
      if (!t.alive) return;
      const d = Math.hypot(t.mesh.position.x - aim.x, t.mesh.position.y - aim.y);
      if (d < bd) { bd = d; best = t; }
    };
    for (const t of this.targets) consider(t);
    if (this.gold.alive) {
      const d = Math.hypot(this.gold.mesh.position.x - aim.x, this.gold.mesh.position.y - aim.y);
      if (d < bd) { bd = d; best = this.gold; }
    }
    return best;
  }

  popTarget(t, pts) {
    t.alive = false;
    gsap.to(t.mesh.scale, {
      x: 0.001, y: 0.001, z: 0.001, duration: 0.15, overwrite: true,
      onComplete: () => { t.mesh.visible = false; }
    });
    this.score += pts;
    this.level = 1 + Math.floor(this.score / 10);
    sounds.pop();
    this.particles.burst(t.mesh.position.clone(), t.gold ? 50 : 22);
    this.ev.onHud?.(this.stats());
    if (t.gold) {
      this.ev.onPop?.('🌟 DOURADO +5!');
      cheer('Balão dourado! Demais!');
      t.t = 12; // próximo dourado
    }
  }

  fire(weapon, aim, from) {
    if (weapon === 0) {
      this.tracer(aim, 0x22d3ee, false, from);
      sounds.pew();
      this.showMark(aim.x, aim.y, 0xffffff); // onde pegou (acerto ou não!)
      const t = this.nearestTarget(aim, 0.55);
      if (t) {
        this.popTarget(t, t.gold ? 5 : t.points);
        this.showMark(aim.x, aim.y, 0xfacc15);
        if (!t.gold) this.ev.onPop?.(`+${t.points} 🎈`);
      }
    } else {
      if (this.cannonCool > 0) return;
      this.cannonCool = 2.5;
      this.tracer(aim, 0xfb923c, true, from);
      sounds.kick();
      this.shake = 0.3;
      let hitAny = false, direct = false;
      for (const t of [...this.targets, this.gold]) {
        if (!t.alive) continue;
        const d = Math.hypot(t.mesh.position.x - aim.x, t.mesh.position.y - aim.y);
        if (d < 1.2) {
          this.popTarget(t, d < 0.5 ? 3 : 1);
          hitAny = true;
          if (d < 0.5) direct = true;
        }
      }
      this.particles.burst(new THREE.Vector3(aim.x, aim.y, WALL_Z - 0.4), 45);
      if (direct) { this.ev.onPop?.('💥 EM CHEIO!'); cheer('Em cheio!'); }
      else if (!hitAny) this.ev.onMsg?.('💥 Pra fora!');
    }
  }

  async start() {
    this.score = 0; this.level = 1;
    this.weapon = 0;
    this.cannonCool = 0; this.fireT = { l: 0, r: 0.17 };
    this.timeLeft = GAME_S;
    this.msgT = 0; this.lastWholeSec = -1;
    this.peaceCool = 0;
    this.gold.alive = false; this.gold.mesh.visible = false; this.gold.t = 8;
    for (const t of this.targets) {
      t.alive = true; t.mesh.visible = true;
      t.mesh.scale.set(1, 1, 1);
      t.respawnT = 0;
    }
    this.running = true;
    this.clock.start();
    this.state = 'countdown';
    this.countTimer = 0; this.countStep = 0;
    sounds.whistle();
    this.ev.onHud?.(this.stats());
    this.loop();
  }

  stop() { this.running = false; }

  speed() { return 0.8 + this.level * 0.15; }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    let joints = null;
    try { joints = this._provider ? this._provider() : null; } catch {}
    this.avatar.setJoints(joints);
    let hands = [];
    try { hands = this._handsProvider ? this._handsProvider() : []; } catch {}
    if (hands.length) this.mouse.lastHand = Date.now();
    try { this._frameHook?.(); } catch {}

    if (this.state === 'countdown') {
      this.countTimer += dt;
      const seq = ['3️⃣', '2️⃣', '1️⃣', 'MIREM! 🎯'];
      const idx = Math.min(Math.floor(this.countTimer / 0.7), 3);
      if (idx !== this.countStep) { this.countStep = idx; sounds.countdown(); this.ev.onMsg?.(seq[idx]); }
      if (this.countTimer > 2.9) {
        this.state = 'playing';
        sounds.go();
        this.ev.onMsg?.('Mire com as luvas! ✌️ troca, 👌 canhão!');
      }
    } else if (this.state === 'playing') {
      // mira DUAL: cada luva tem a sua (punho = estável). Sem espelho.
      const hasJoints = joints && joints.lWr && joints.rWr;
      if (hasJoints) {
        this.aimL = mapGloveToAim(joints.lWr);
        this.aimR = mapGloveToAim(joints.rWr);
        this.gloveL.set(joints.lWr.x, joints.lWr.y, joints.lWr.z);
        this.gloveR.set(joints.rWr.x, joints.rWr.y, joints.rWr.z);
      } else if (this.mouse.active) {
        this.aimR = { x: this.mouse.x, y: this.mouse.y };
        this.gloveR.set(this.aimR.x * 0.35, 0.25, 1.2);
      }
      const showL = !!hasJoints;
      const showR = !!hasJoints || this.mouse.active;
      this.placeCross(this.crossL, this.aimLineL, this.aimL, this.gloveL, showL, dt, t);
      this.placeCross(this.crossR, this.aimLineR, this.aimR, this.gloveR, showR, dt, t);
      this.mouse.clickFire = () => this.fire(this.weapon, this.aimR, this.gloveR);

      // ✌️ troca de arma (com debounce)
      this.peaceCool = Math.max(0, this.peaceCool - dt);
      if (this.peaceCool <= 0 && hands.some(h => isPeace(h).ok)) {
        this.peaceCool = 1;
        this.setWeapon(this.weapon === 0 ? 1 : 0);
      }
      // 🔫 bolhas automáticas — CADA luva atira sozinha (gatilhos defasados = alternado!)
      this.fireT.l += dt;
      this.fireT.r += dt;
      if (this.weapon === 0) {
        if (showL && this.fireT.l > 0.35) { this.fireT.l = 0; this.fire(0, this.aimL, this.gloveL); }
        if (showR && this.fireT.r > 0.35) { this.fireT.r = 0; this.fire(0, this.aimR, this.gloveR); }
      }
      // 💥 canhão na pinça — dispara na mira da MÃO que pinçou
      this.cannonCool = Math.max(0, this.cannonCool - dt);
      const crossCol = this.weapon === 0 ? 0x22d3ee : (this.cannonCool > 0 ? 0x6b7280 : 0xfb923c);
      for (const c of [this.crossL, this.crossR]) {
        c.ring.material.color.set(crossCol);
        c.dot.material.color.set(crossCol);
      }
      if (this.weapon === 1) {
        for (const h of hands) {
          if (isPinch(h)) {
            const tip = tipWorld(h);
            const useL = Math.hypot(tip.x - this.aimL.x, tip.y - this.aimL.y)
              < Math.hypot(tip.x - this.aimR.x, tip.y - this.aimR.y);
            this.fire(1, useL ? this.aimL : this.aimR, useL ? this.gloveL : this.gloveR);
          }
        }
      }

      // alvos balançando
      const sp = this.speed();
      for (const tg of this.targets) {
        if (tg.alive) {
          tg.mesh.position.x = tg.baseX + Math.sin(t * sp + tg.phase) * 1.0;
        } else {
          tg.respawnT -= dt;
          if (tg.respawnT <= 0) {
            tg.alive = true;
            tg.mesh.visible = true;
            gsap.fromTo(tg.mesh.scale, { x: 0.01, y: 0.01, z: 0.01 },
              { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2.5)', overwrite: true });
          }
        }
      }
      // dourado bônus
      const gd = this.gold;
      if (!gd.alive) {
        gd.t -= dt;
        if (gd.t <= 0) {
          gd.alive = true;
          gd.life = 4;
          gd.baseX = (Math.random() - 0.5) * 6;
          gd.mesh.visible = true;
          gd.mesh.scale.set(1, 1, 1);
          this.ev.onMsg?.('🌟 Balão DOURADO! Vale 5!');
        }
      } else {
        gd.life -= dt;
        gd.mesh.position.set(gd.baseX + Math.sin(t * sp * 1.8) * 1.4, 2.9, WALL_Z - 0.35);
        if (gd.life <= 0) { gd.alive = false; gd.mesh.visible = false; gd.t = 12; }
      }
      for (const o of this.targets) if (!o.alive && o.respawnT <= 0 && !o.mesh.visible) o.respawnT = 1.5 + Math.random() * 1.5;

      // timer
      this.timeLeft -= dt;
      this.msgT += dt;
      if (this.msgT > 0.25) {
        this.msgT = 0;
        const w = this.weapon === 0 ? '🔫 Bolhas' : `💥 Canhão${this.cannonCool > 0 ? '...' : ' PRONTO!'}`;
        this.ev.onMsg?.(`${w} • ⏱ ${Math.max(0, Math.ceil(this.timeLeft))}s`);
        this.ev.onHud?.(this.stats());
      }
      const whole = Math.ceil(this.timeLeft);
      if (whole !== this.lastWholeSec) {
        this.lastWholeSec = whole;
        if (whole <= 5 && whole > 0) sounds.countdown();
      }
      if (this.timeLeft <= 0) {
        this.state = 'over';
        storage.saveBest('shooter', this.score);
        sounds.whistle();
        this.ev.onHud?.(this.stats());
        this.ev.onPop?.('⏱️ TEMPO!');
        setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
      }
    }

    for (const tr of this.tracers) {
      if (tr.life > 0) {
        tr.life -= dt * 7;
        tr.line.material.opacity = Math.max(0, tr.life) * 0.9;
        if (tr.life <= 0) tr.line.visible = false;
      }
    }
    this.avatar.update(dt);
    this.particles.update(dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.4;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * s,
        this.camBase.y + (Math.random() - 0.5) * s,
        this.camBase.z
      );
    } else this.camera.position.copy(this.camBase);
    this.renderer.render(this.scene, this.camera);
  };
}
