// Boneco 3D do goleiro — marionete que copia a criança + HITBOXES generosas
import * as THREE from 'three';
import { GOAL_W, GOAL_H } from '../vision/tracking.js';

const SKIN = 0xffc490, SHIRT = 0x2563eb, SHORTS = 0xef4444, GLOVE = 0xfacc15, SHOE = 0x111827;

export class Avatar3D {
  // opts: { ghost: true } = fantasma dourado transparente (mostra pose-alvo);
  //       { number: '1' } = número nas costas da camisa
  constructor(scene, opts = {}) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.joints = null;
    this.time = 0;

    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
    this.mats = { skin: mat(SKIN), shirt: mat(SHIRT), shorts: mat(SHORTS), glove: mat(GLOVE), shoe: mat(SHOE) };
    this.mats.glove.emissive = new THREE.Color(0x8a6d00);
    this.mats.glove.emissiveIntensity = 0.45; // luvas brilham = hitbox legível

    // esferas das articulações
    this.spheres = {};
    const mkBall = (name, r, material) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), material);
      m.castShadow = true;
      this.group.add(m);
      this.spheres[name] = m;
      return m;
    };
    mkBall('head', 0.26, this.mats.skin);
    mkBall('lSh', 0.13, this.mats.shirt); mkBall('rSh', 0.13, this.mats.shirt);
    mkBall('lEl', 0.11, this.mats.skin); mkBall('rEl', 0.11, this.mats.skin);
    // LUVAS GIGANTES = hitbox visual das mãos
    mkBall('lWr', 0.30, this.mats.glove); mkBall('rWr', 0.30, this.mats.glove);
    mkBall('lHip', 0.14, this.mats.shorts); mkBall('rHip', 0.14, this.mats.shorts);
    mkBall('lKnee', 0.12, this.mats.skin); mkBall('rKnee', 0.12, this.mats.skin);
    mkBall('lAnk', 0.13, this.mats.shoe); mkBall('rAnk', 0.13, this.mats.shoe);

    // olhos na cabeça (lado do campo, +z) + cabelo atrás (lado da câmera, -z:
    // a câmera fica dentro do gol, então vemos as COSTAS do goleiro)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
    this.eyeR = this.eyeL.clone();
    this.group.add(this.eyeL, this.eyeR);
    this.hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.9 })
    );
    this.hair.scale.set(1, 0.75, 0.8);
    this.group.add(this.hair);

    // ossos = cilindros esticados entre articulações
    this.bones = {};
    const mkBone = (name, r, material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), material);
      m.castShadow = true;
      this.group.add(m);
      this.bones[name] = m;
      return m;
    };
    mkBone('torso', 0.24, this.mats.shirt);
    mkBone('armL1', 0.09, this.mats.shirt); mkBone('armR1', 0.09, this.mats.shirt);
    mkBone('armL2', 0.075, this.mats.skin); mkBone('armR2', 0.075, this.mats.skin);
    mkBone('legL1', 0.11, this.mats.shorts); mkBone('legR1', 0.11, this.mats.shorts);
    mkBone('legL2', 0.085, this.mats.skin); mkBone('legR2', 0.085, this.mats.skin);

    // anéis das HITBOXES (só visual divertido, semitransparente)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.35 });
    this.ringL = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), ringMat.clone());
    this.ringR = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), ringMat.clone());
    this.group.add(this.ringL, this.ringR);

    // número da camisa nas costas (lado da câmera)
    this.number = null;
    if (!opts.ghost) {
      this.number = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshBasicMaterial({ map: makeNumberTexture(opts.number || '1'), transparent: true })
      );
      this.group.add(this.number);
    }
    // modo fantasma: tudo dourado transparente (pose-alvo da Estátua)
    if (opts.ghost) {
      const gm = new THREE.MeshStandardMaterial({
        color: 0xfbbf24, transparent: true, opacity: 0.45, roughness: 0.4, depthWrite: false
      });
      this.group.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
    }

    // pose neutra inicial (dentro do gol)
    this.pose = neutralPose();
    this.applyPose(0);
  }

  setJoints(j) { this.joints = j; }

  update(dt) {
    this.time += dt;
    if (this.joints) {
      const j = this.joints;
      const P = (p, fallback) => (p && p.visible !== false ? p : fallback);
      const prev = this.pose;
      // converge para medição (puppet suave) + clamp no gol.
      // Luvas (o que defende!) seguem QUASE direto = latência mínima;
      // resto do corpo filtra mais = sem tremedeira.
      const cl = (v, fb, follow = 0.7) => ({
        x: clamp(lerp(prev[fb].x, v?.x ?? prev[fb].x, follow), -GOAL_W / 2 - 0.6, GOAL_W / 2 + 0.6),
        y: clamp(lerp(prev[fb].y, v?.y ?? prev[fb].y, follow), -0.1, 2.9),
        z: lerp(prev[fb].z, (v?.z ?? 0) * 1 + 0.1, 0.5)
      });
      this.pose.head = cl(P(j.nose), 'head', 0.8); this.pose.head.y += 0.28;
      this.pose.lSh = cl(P(j.lSh), 'lSh'); this.pose.rSh = cl(P(j.rSh), 'rSh');
      this.pose.lEl = cl(P(j.lEl), 'lEl', 0.85); this.pose.rEl = cl(P(j.rEl), 'rEl', 0.85);
      this.pose.lWr = cl(P(j.lWr), 'lWr', 0.9); this.pose.rWr = cl(P(j.rWr), 'rWr', 0.9);
      this.pose.lHip = cl(P(j.lHip), 'lHip'); this.pose.rHip = cl(P(j.rHip), 'rHip');
      this.pose.lKnee = cl(P(j.lKnee), 'lKnee'); this.pose.rKnee = cl(P(j.rKnee), 'rKnee');
      this.pose.lAnk = cl(P(j.lAnk), 'lAnk'); this.pose.rAnk = cl(P(j.rAnk), 'rAnk');
    } else {
      // idle: respirando no meio do gol
      const b = Math.sin(this.time * 2) * 0.05;
      this.pose = neutralPose(b);
      this.pose.lWr.x += Math.sin(this.time * 1.4) * 0.15;
      this.pose.rWr.x += Math.cos(this.time * 1.4) * 0.15;
    }
    this.applyPose(dt);
  }

  applyPose() {
    const p = this.pose, S = this.spheres;
    setV(S.head, p.head); setV(S.lSh, p.lSh); setV(S.rSh, p.rSh);
    setV(S.lEl, p.lEl); setV(S.rEl, p.rEl);
    setV(S.lWr, p.lWr); setV(S.rWr, p.rWr);
    setV(S.lHip, p.lHip); setV(S.rHip, p.rHip);
    setV(S.lKnee, p.lKnee); setV(S.rKnee, p.rKnee);
    setV(S.lAnk, p.lAnk); setV(S.rAnk, p.rAnk);
    // olhos (frente, lado do campo) + cabelo (atrás, lado da câmera)
    this.eyeL.position.set(p.head.x - 0.09, p.head.y + 0.05, p.head.z + 0.22);
    this.eyeR.position.set(p.head.x + 0.09, p.head.y + 0.05, p.head.z + 0.22);
    this.hair.position.set(p.head.x, p.head.y + 0.1, p.head.z - 0.1);

    stretch(this.bones.torso, mid(p.lSh, p.rSh, p.lHip, p.rHip, 'top'), mid(p.lSh, p.rSh, p.lHip, p.rHip, 'bot'));
    stretch(this.bones.armL1, p.lSh, p.lEl); stretch(this.bones.armR1, p.rSh, p.rEl);
    stretch(this.bones.armL2, p.lEl, p.lWr); stretch(this.bones.armR2, p.rEl, p.rWr);
    stretch(this.bones.legL1, p.lHip, p.lKnee); stretch(this.bones.legR1, p.rHip, p.rKnee);
    stretch(this.bones.legL2, p.lKnee, p.lAnk); stretch(this.bones.legR2, p.rKnee, p.rAnk);

    setV(this.ringL, p.lWr); setV(this.ringR, p.rWr);
    const pulse = 1 + Math.sin(this.time * 6) * 0.06;
    this.ringL.scale.setScalar(pulse); this.ringR.scale.setScalar(pulse);

    // número acompanha as costas do tronco
    if (this.number) {
      const tTop = mid(p.lSh, p.rSh, p.lHip, p.rHip, 'top');
      const tBot = mid(p.lSh, p.rSh, p.lHip, p.rHip, 'bot');
      this.number.position.set((tTop.x + tBot.x) / 2, (tTop.y + tBot.y) / 2 + 0.02, (tTop.z + tBot.z) / 2 - 0.28);
      this.number.rotation.y = Math.PI;
    }
  }

  // HITBOXES 3D — usadas na colisão com a bola
  getHitboxes() {
    const p = this.pose;
    const v = (o) => new THREE.Vector3(o.x, o.y, o.z);
    const torso = mid(p.lSh, p.rSh, p.lHip, p.rHip, 'top');
    return [
      { name: 'luvaL', pos: v(p.lWr), r: 0.52 },   // generosa p/ criança
      { name: 'luvaR', pos: v(p.rWr), r: 0.52 },
      { name: 'cabeca', pos: v(p.head), r: 0.36 },
      { name: 'peito', pos: new THREE.Vector3(torso.x, torso.y, torso.z), r: 0.58 },
      { name: 'barriga', pos: v(mid(p.lSh, p.rSh, p.lHip, p.rHip, 'bot')), r: 0.5 },
      { name: 'cotovL', pos: v(p.lEl), r: 0.3 },
      { name: 'cotovR', pos: v(p.rEl), r: 0.3 }
    ];
  }
}

function neutralPose(b = 0) {
  return {
    head: { x: 0, y: 1.85 + b, z: 0.1 },
    lSh: { x: -0.45, y: 1.45 + b, z: 0.1 }, rSh: { x: 0.45, y: 1.45 + b, z: 0.1 },
    lEl: { x: -0.75, y: 1.15 + b, z: 0.15 }, rEl: { x: 0.75, y: 1.15 + b, z: 0.15 },
    lWr: { x: -0.95, y: 1.35 + b, z: 0.25 }, rWr: { x: 0.95, y: 1.35 + b, z: 0.25 },
    lHip: { x: -0.22, y: 0.85, z: 0.05 }, rHip: { x: 0.22, y: 0.85, z: 0.05 },
    lKnee: { x: -0.24, y: 0.45, z: 0.05 }, rKnee: { x: 0.24, y: 0.45, z: 0.05 },
    lAnk: { x: -0.26, y: 0.08, z: 0.05 }, rAnk: { x: 0.26, y: 0.08, z: 0.05 }
  };
}
function setV(mesh, p) { mesh.position.set(p.x, p.y, p.z); }
function makeNumberTexture(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 92px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#1e3a8a';
  g.strokeText(n, 64, 70);
  g.fillStyle = '#ffffff';
  g.fillText(n, 64, 70);
  return new THREE.CanvasTexture(c);
}
function mid(a, b, c, d, which) {
  const top = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  const bot = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2, z: (c.z + d.z) / 2 };
  return which === 'top' ? top : { x: (top.x + bot.x) / 2, y: (top.y + bot.y) / 2 - 0.15, z: (top.z + bot.z) / 2 };
}
function stretch(mesh, a, b) {
  const va = new THREE.Vector3(a.x, a.y, a.z), vb = new THREE.Vector3(b.x, b.y, b.z);
  const d = vb.clone().sub(va);
  const len = Math.max(d.length(), 0.001);
  mesh.position.copy(va).addScaledVector(d, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
