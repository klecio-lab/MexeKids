// 🥊 Soco Maluco — soque o robô de treino (luva RÁPIDA perto dele = POW!)
// e bloqueie as estrelas de energia que ele joga de volta.
// Implementa o contrato do hub (ver games/_template.js).
import * as THREE from 'three';
import { Avatar3D } from '../game/avatar3d.js';
import { Ball3D } from '../game/ball.js';
import { Particles3D } from '../game/particles3d.js';
import { sounds, cheer } from '../engine/audio.js';
import { storage } from '../engine/storage.js';

// Detecção de soco pura (testável em Node): luva rápida + perto do alvo.
// g/prev: {x,y,z} da luva; t: centro do alvo; r: raio do alvo.
export function punchHit(g, prev, dt, t, r, speedMin = 2.2, reach = 1.3) {
  if (!g || !prev || dt <= 0) return { hit: false, speed: 0 };
  const speed = Math.hypot(g.x - prev.x, g.y - prev.y, (g.z - prev.z) * 0.7) / dt;
  const d = Math.hypot(g.x - t.x, g.y - t.y, g.z - t.z);
  return { hit: speed > speedMin && d < r + reach, speed };
}

const POWS = ['🥊 POW!', '💥 BAM!', '⭐ KAPOW!', '💪 BOA!'];
const OUCH = ['Ai! Bloqueie com as luvas! 🧤', 'Quase! Mãos pra cima! 🙌', 'Opa! Defenda a estrela! ⭐'];

function buildRing(scene) {
  scene.background = new THREE.Color(0x1e1b4b);
  scene.fog = new THREE.Fog(0x1e1b4b, 20, 45);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x312e81, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(5, 10, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x17153a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // tablado do ringue
  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 0.2, 7.5),
    new THREE.MeshStandardMaterial({ color: 0x2563eb })
  );
  mat.position.y = 0.1;
  mat.receiveShadow = true;
  scene.add(mat);
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.35, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.205;
  scene.add(circle);

  // postes + cordas
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af });
  const ropeColors = [0xef4444, 0xffffff, 0x3b82f6];
  for (const sx of [-3.4, 3.4]) for (const sz of [-3.4, 3.4]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 12), postMat);
    p.position.set(sx, 0.85, sz);
    p.castShadow = true;
    scene.add(p);
  }
  [0.6, 1.0, 1.4].forEach((h, i) => {
    const rm = new THREE.MeshBasicMaterial({ color: ropeColors[i] });
    for (const [w, d, x, z] of [[6.8, 0.06, 0, -3.4], [6.8, 0.06, 0, 3.4], [0.06, 6.8, -3.4, 0], [0.06, 6.8, 3.4, 0]]) {
      const rope = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), rm);
      rope.position.set(x, h, z);
      scene.add(rope);
    }
  });

  // holofotes (cones translúcidos, baratos)
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfef9c3, transparent: true, opacity: 0.13,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  for (const sx of [-2.5, 2.5]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 20, 1, true), coneMat);
    cone.position.set(sx, 5, 1);
    scene.add(cone);
  }
}

// Robô de treino bobão (olhos pro jogador = lado -z)
function buildRobot() {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
  for (const sx of [-0.18, 0.18]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.6, 12), dark), sx, 0.4, 0);
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.75, 18), red), 0, 1.15, 0);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 10, 24), new THREE.MeshStandardMaterial({ color: 0xfacc15 }), ), 0, 0.82, 0).rotation.x = Math.PI / 2;
  for (const sx of [-0.5, 0.5]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 10), silver), sx, 1.2, 0);
  }
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
  const gloveGeo = new THREE.SphereGeometry(0.16, 14, 12);
  const gloveL = add(new THREE.Mesh(gloveGeo, gloveMat), -0.5, 0.9, 0);
  const gloveR = add(new THREE.Mesh(gloveGeo, gloveMat), 0.5, 0.9, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), silver), 0, 1.85, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
  for (const sx of [-0.11, 0.11]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeMat);
    e.position.set(sx, 1.9, -0.25);
    g.add(e);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.3), red), 0, 2.14, 0); // moicano
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), dark), 0, 2.2, 0.1);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }), ), 0, 2.38, 0.1);
  // barra de HP flutuante
  const hpBg = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0x7f1d1d }));
  hpBg.position.set(0, 2.55, 0);
  g.add(hpBg);
  const hpFg = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  hpFg.position.set(0, 2.55, 0);
  g.add(hpFg);
  g.position.set(0, 0, 1.7);
  return { group: g, hpFg, gloveL, gloveR };
}

export class FightGame {
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ev = events;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 1.9, -2.8);
    this.camera.lookAt(0, 1.25, 2.5);
    this.camBase = this.camera.position.clone();
    this.shake = 0;

    buildRing(this.scene);
    this.avatar = new Avatar3D(this.scene);
    this.avatar.group.position.y = 0.12; // pés em cima do tablado (topo y=0.2)
    const { group, hpFg, gloveL, gloveR } = buildRobot();
    this.robot = group;
    this.hpFg = hpFg;
    this.gloveL = gloveL;
    this.gloveR = gloveR;
    this.robot.scale.setScalar(1.15); // robô grandão = visível + acertável
    this.robot.position.y = 0.12;
    this.scene.add(this.robot);
    // IA do oponente: weave -> windup (telegrafa) -> punch -> return (+finta, esquiva)
    this.foe = { mode: 'weave', t: 0, nextAtk: 3.2, side: 1, punched: false };
    this.dodgeT = 0;
    this.dodgeDir = 1;
    this.stars = [new Ball3D(this.scene), new Ball3D(this.scene)];
    // estrelas de energia amareladas (mesma física da bola do goleiro)
    for (const s of this.stars) {
      s.mesh.material = s.mesh.material.clone();
      s.mesh.material.color.set(0xfde047);
    }
    this.particles = new Particles3D(this.scene);

    this._provider = null;
    this._frameHook = null;
    this.clock = new THREE.Clock();
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.bindMouseFallback();

    this.score = 0; this.hearts = 3; this.level = 1;
    this.hp = 0; this.hpMax = 1;
    this.cool = { l: 0, r: 0 };
    this.prevGlove = { l: null, r: null };
    this.combo = 0; this.comboT = 0;
    this.wob = 0; this.koT = 0;
    this.starTimer = 3;
    this.mouseBackup = { x: 0, y: 1.3, active: false, lastPose: 0 };
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
    if (this._mouseFn) window.removeEventListener('mousemove', this._mouseFn);
    try { this.renderer.dispose(); } catch {}
  }

  setJointsProvider(fn) { this._provider = fn; }
  setFrameHook(fn) { this._frameHook = fn; }
  stats() {
    return {
      saves: this.score, goals: 3 - this.hearts, level: this.level,
      best: Math.max(storage.best('fight'), 0)
    };
  }

  bindMouseFallback() {
    // sem câmera: o mouse move as duas luvas (modo teste)
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

  async start() {
    this.score = 0; this.hearts = 3; this.level = 1;
    this.hpMax = 8; this.hp = this.hpMax;
    this.combo = 0; this.wob = 0; this.koT = 0;
    this.starTimer = 3.5;
    this.prevGlove = { l: null, r: null };
    this.running = true;
    this.clock.start();
    this.state = 'countdown';
    this.countTimer = 0; this.countStep = 0;
    sounds.whistle();
    this.ev.onHud?.(this.stats());
    this.loop();
  }

  stop() { this.running = false; }

  robotChest(out) {
    out = out || new THREE.Vector3();
    return out.set(this.robot.position.x, 1.3 * this.robot.scale.x + this.robot.position.y, 1.7);
  }

  throwStar() {
    const b = this.stars.find(s => !s.active);
    if (!b) return;
    const rx = this.robot.position.x;
    b.shoot(this.level);
    b.from.set(rx, 1.6, 3.0); // nasce na frente do robô (sem atravessar o corpo)
    // cantos + baixo + alto: parado não bloqueia tudo, tem que se mexer!
    b.to.set((Math.random() - 0.5) * 4.4, 0.3 + Math.random() * 1.9, 0);
    b.t = 0;
    b.flightTime = Math.max(0.9, 1.9 - this.level * 0.12);
    b.mesh.position.copy(b.from);
    sounds.kick();
  }

  onBlocked(pos) {
    this.score++;
    this.combo++;
    this.comboT = 1.2;
    sounds.ding();
    this.particles.burst(pos.clone(), 25);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.('✋ BLOQUEIO!');
  }

  onStarHit(to) {
    this.ev.onPop?.('⭐ AI!');
    cheer(OUCH[Math.floor(Math.random() * OUCH.length)]);
    this.loseHeart(new THREE.Vector3(to.x, to.y, 0.3));
  }

  // Coração perdido (estrela ou soco do robô): caminho único p/ game-over
  loseHeart(pos) {
    this.hearts--;
    this.combo = 0;
    sounds.goal();
    this.shake = 0.4;
    this.particles.burst(pos.clone ? pos.clone() : pos, 25, [0x94a3b8, 0xcbd5e1]);
    storage.saveBest('fight', this.score);
    this.ev.onHud?.(this.stats());
    if (this.hearts <= 0) {
      this.state = 'over';
      setTimeout(() => this.ev.onGameOver?.(this.stats()), 1200);
    } else {
      this.ev.onMsg?.(`💔 ${3 - this.hearts}/3 — luvas pra cima!`);
    }
  }

  // Soco DO robô: bloqueia só com luva/cabeça na trajetória (tronco não vale!)
  resolveFoePunch(side) {
    const fist = new THREE.Vector3(
      this.robot.position.x + side * 0.6,
      1.45 * this.robot.scale.x + this.robot.position.y,
      0.45
    );
    let blocked = false;
    for (const hb of this.avatar.getHitboxes()) {
      if (hb.name !== 'luvaL' && hb.name !== 'luvaR' && hb.name !== 'cabeca') continue;
      if (hb.pos.distanceTo(fist) < 0.7) { blocked = true; break; }
    }
    if (blocked) {
      this.score++;
      this.combo++;
      this.comboT = 1.2;
      sounds.ding();
      this.particles.burst(fist, 30);
      this.ev.onHud?.(this.stats());
      this.ev.onPop?.('🛡️ DEFESA!');
    } else {
      this.ev.onPop?.('🤖 POW!');
      this.loseHeart(fist);
    }
  }

  // Máquina de estados do oponente (só roda fora do nocaute)
  updateFoe(dt) {
    const F = this.foe;
    F.t += dt;
    const atkGap = Math.max(2.0, 4.2 - this.level * 0.35);
    if (F.mode === 'weave') {
      if (F.t > F.nextAtk) {
        F.mode = 'windup'; F.t = 0; F.side = -F.side; F.punched = false;
        this.ev.onMsg?.('❗ DEFENDA!');
        sounds.countdown();
      }
    } else if (F.mode === 'windup') {
      this.robot.rotation.x = 0.22; // agacha = telegrafa o soco
      this.robot.position.x += (Math.random() - 0.5) * 0.07; // treme
      if (F.t > 0.55) {
        if (this.level >= 3 && Math.random() < 0.3) {
          this.robot.rotation.x = 0;
          F.mode = 'weave'; F.t = 0; F.nextAtk = 1.6;
          this.ev.onMsg?.('😅 Fintou! Boa guarda!');
        } else { F.mode = 'punch'; F.t = 0; }
      }
    } else if (F.mode === 'punch') {
      const k = Math.min(1, F.t / 0.18);
      this.robot.position.z = 1.7 - 0.7 * k; // investida
      const glove = F.side < 0 ? this.gloveL : this.gloveR;
      glove.position.z = -0.55 * k; // luva estende
      this.robot.rotation.x = -0.12 * k;
      this.robot.rotation.z = F.side * 0.15 * k;
      if (!F.punched && F.t > 0.2) { F.punched = true; this.resolveFoePunch(F.side); }
      if (F.t > 0.5) { F.mode = 'return'; F.t = 0; }
    } else if (F.mode === 'return') {
      const k = Math.min(1, F.t / 0.22);
      this.robot.position.z = 1.0 + 0.7 * k;
      const glove = F.side < 0 ? this.gloveL : this.gloveR;
      glove.position.z = -0.55 * (1 - k);
      this.robot.rotation.x = -0.12 * (1 - k);
      this.robot.rotation.z = F.side * 0.15 * (1 - k);
      if (F.t > 0.24) {
        glove.position.z = 0;
        this.robot.rotation.x = 0; this.robot.rotation.z = 0;
        this.robot.position.z = 1.7;
        F.mode = 'weave'; F.t = 0;
        F.nextAtk = atkGap * (0.8 + Math.random() * 0.5);
      }
    }
  }

  onPunch(side, glovePos) {
    this.hp--;
    this.combo++;
    this.comboT = 1.2;
    const gain = 1 + Math.floor(this.combo / 3);
    this.score += gain;
    this.wob = 1;
    this.cool[side] = 0.4;
    this.shake = Math.max(this.shake, 0.15);
    sounds.smack();
    this.particles.burst(glovePos.clone(), 35);
    this.hpFg.scale.x = Math.max(0.001, this.hp / this.hpMax);
    this.hpFg.position.x = -0.62 * (1 - this.hp / this.hpMax);
    this.ev.onHud?.(this.stats());
    this.ev.onPop?.(POWS[Math.floor(Math.random() * POWS.length)]);
    if (this.combo >= 3) this.ev.onMsg?.(`🔥 COMBO x${this.combo}!`);
    if (this.hp <= 0) {
      // NOCAUTE! robô cai, próximo nível mais rápido (reseta pose de ataque)
      this.gloveL.position.z = 0;
      this.gloveR.position.z = 0;
      this.robot.rotation.z = 0;
      this.foe.mode = 'weave'; this.foe.t = 0; this.foe.nextAtk = 3;
      this.koT = 1.6;
      this.level++;
      this.hpMax = 6 + this.level * 2;
      this.hp = this.hpMax;
      sounds.save();
      this.particles.burst(this.robotChest(new THREE.Vector3()), 80);
      this.ev.onHud?.(this.stats());
      this.ev.onPop?.('🏆 NOCAUTE!');
      cheer(['Nocaute! Incrível!', 'Que sequência!'][this.level % 2]);
    }
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    let joints = null;
    try {
      joints = this._provider ? this._provider() : null;
      if (joints) this.mouseBackup.lastPose = Date.now();
      this.avatar.setJoints(joints);
    } catch {}
    try { this._frameHook?.(); } catch {}

    if (this.state === 'countdown') {
      this.countTimer += dt;
      const seq = ['3️⃣', '2️⃣', '1️⃣', 'LUTEM! 🥊'];
      const idx = Math.min(Math.floor(this.countTimer / 0.7), 3);
      if (idx !== this.countStep) { this.countStep = idx; sounds.countdown(); this.ev.onMsg?.(seq[idx]); }
      if (this.countTimer > 2.9) { this.state = 'playing'; sounds.go(); this.ev.onMsg?.('Soque o robô! 🥊'); }
    } else if (this.state === 'playing') {
      const t = this.clock.elapsedTime;
      // robô se mexe (mais rápido por nível)
      const speed = 0.7 + this.level * 0.18;
      if (this.koT <= 0) this.robot.position.x = Math.sin(t * speed) * 1.5;
      this.robot.position.y = 0.12 + Math.abs(Math.sin(t * 2.2)) * 0.08;
      // balanço do golpe
      if (this.wob > 0) {
        this.wob = Math.max(0, this.wob - dt * 2.2);
        this.robot.rotation.z = Math.sin(t * 22) * 0.25 * this.wob;
      } else this.robot.rotation.z = 0;
      // nocaute: robô deita e levanta
      if (this.koT > 0) {
        this.koT -= dt;
        this.robot.rotation.x = -Math.min(1, (1.6 - this.koT)) * 1.2;
        if (this.koT <= 0) {
          this.robot.rotation.x = 0;
          this.hpFg.scale.x = 1; this.hpFg.position.x = 0;
          this.ev.onMsg?.(`Nível ${this.level} — ele ficou mais rápido! 🤖`);
        }
      } else if (joints) {
        // detecção de SOCO: luva rápida perto do peito do robô
        this.cool.l = Math.max(0, this.cool.l - dt);
        this.cool.r = Math.max(0, this.cool.r - dt);
        this.comboT -= dt;
        if (this.comboT <= 0) this.combo = 0;
        const chest = this.robotChest(FightGame._v || (FightGame._v = new THREE.Vector3()));
        const pg = this.avatar.pose;
        const sides = [['l', pg.lWr, this.prevGlove.l], ['r', pg.rWr, this.prevGlove.r]];
        for (const [side, gv, pv] of sides) {
          const gp = { x: gv.x, y: gv.y, z: gv.z };
          const pp = pv ? { x: pv.x, y: pv.y, z: pv.z } : null;
          // generoso p/ criança: velocidade moderada + alcance grande
          const { hit } = punchHit(gp, pp, dt, { x: chest.x, y: chest.y, z: chest.z }, 0.55, 1.8, 1.5);
          if (hit && this.cool[side] <= 0) {
            // nível 2+: robô às vezes DESVIA (esquiva lateral rápida)
            if (this.level >= 2 && this.koT <= 0 && Math.random() < 0.22) {
              this.cool[side] = 0.5;
              this.dodgeT = 0.45;
              this.dodgeDir = side === 'l' ? 1 : -1;
              this.ev.onMsg?.('💨 Ele desviou! De novo!');
              sounds.click();
            } else {
              this.onPunch(side, new THREE.Vector3(gp.x, gp.y, gp.z));
            }
          }
        }
        this.prevGlove = {
          l: { ...pg.lWr }, r: { ...pg.rWr }
        };
      }
      // IA do oponente + esquiva (fora do nocaute)
      if (this.koT <= 0) this.updateFoe(dt);
      if (this.dodgeT > 0) {
        this.dodgeT -= dt;
        this.robot.position.x += this.dodgeDir * dt * 7;
        this.robot.rotation.z = this.dodgeDir * 0.45;
      }
      // robô joga estrelas de volta
      this.starTimer -= dt;
      if (this.starTimer <= 0 && this.koT <= 0) {
        this.throwStar();
        this.starTimer = Math.max(2.2, 5.5 - this.level * 0.4) * (0.8 + Math.random() * 0.5);
      }
      for (const ball of this.stars) {
        if (!ball.active) continue;
        const st = ball.update(dt);
        if (ball.pos.z < 2.2 && !ball.saved) {
          for (const hb of this.avatar.getHitboxes()) {
            if (hb.pos.distanceTo(ball.pos) < hb.r + 0.22) {
              ball.saved = true;
              ball.hide();
              this.onBlocked(ball.pos);
              break;
            }
          }
        }
        if (st === 'arrived' && !ball.saved) { ball.hide(); this.onStarHit(ball.to); }
      }
    }

    // mouse fallback (sem câmera)
    if (this.mouseBackup.active && Date.now() - this.mouseBackup.lastPose > 2500) {
      this.avatar.pose.lWr.x = this.mouseBackup.x - 0.35;
      this.avatar.pose.lWr.y = this.mouseBackup.y;
      this.avatar.pose.rWr.x = this.mouseBackup.x + 0.35;
      this.avatar.pose.rWr.y = this.mouseBackup.y;
      this.avatar.applyPose();
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
