// Bola 3D com física de voo até o gol
import * as THREE from 'three';
import { GOAL_W, GOAL_H } from '../vision/tracking.js';

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#111827';
  g.beginPath(); g.arc(64, 64, 22, 0, 7); g.fill();
  for (const [x, y] of [[20, 20], [108, 20], [20, 108], [108, 108]]) {
    g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
}
let tex = null;

export class Ball3D {
  constructor(scene) {
    if (!tex) tex = ballTexture();
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 18),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
    );
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    // rastro: linha com fade ( Additive ) — bola rápida fica legível
    this.trailN = 14;
    this.trailPos = new Float32Array(this.trailN * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    const cols = new Float32Array(this.trailN * 3);
    for (let i = 0; i < this.trailN; i++) {
      const f = 1 - i / this.trailN;
      cols[i * 3] = f; cols[i * 3 + 1] = f; cols[i * 3 + 2] = f;
    }
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.trail.visible = false;
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.active = false;
    this.t = 0;
  }

  shoot(level) {
    // origem: marca do pênalti, alvo aleatório dentro do gol
    this.from = new THREE.Vector3((Math.random() - 0.5) * 4, 0.6 + Math.random() * 1.6, 12);
    const margin = 0.35;
    this.to = new THREE.Vector3(
      (Math.random() - 0.5) * (GOAL_W - margin * 2),
      0.35 + Math.random() * (GOAL_H - 0.6),
      0
    );
    this.flightTime = Math.max(0.75, 1.7 - level * 0.13); // mais rápido por nível
    this.curve = (Math.random() - 0.5) * (0.4 + level * 0.12);
    this.t = 0;
    this.active = true;
    this.saved = false;
    this.mesh.visible = true;
    this.mesh.position.copy(this.from);
    for (let i = 0; i < this.trailN; i++) {
      this.trailPos[i * 3] = this.from.x;
      this.trailPos[i * 3 + 1] = this.from.y;
      this.trailPos[i * 3 + 2] = this.from.z;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trail.visible = true;
  }

  update(dt) {
    if (!this.active) return null;
    this.t += dt / this.flightTime;
    const t = Math.min(this.t, 1);
    const pos = this.from.clone().lerp(this.to, t);
    pos.x += Math.sin(t * Math.PI) * this.curve;      // curva
    pos.y += Math.sin(t * Math.PI) * 0.35;            // arco
    this.mesh.position.copy(pos);
    this.mesh.rotation.x += dt * 9;
    this.mesh.rotation.y += dt * 5;
    // empurra rastro: ponto novo na ponta (índice alto = mais claro)
    this.trailPos.copyWithin(0, 3);
    this.trailPos[(this.trailN - 1) * 3] = pos.x;
    this.trailPos[(this.trailN - 1) * 3 + 1] = pos.y;
    this.trailPos[(this.trailN - 1) * 3 + 2] = pos.z;
    this.trailGeo.attributes.position.needsUpdate = true;
    if (this.t >= 1) { this.active = false; return 'arrived'; }
    return 'flying';
  }

  get pos() { return this.mesh.position; }
  hide() { this.active = false; this.mesh.visible = false; this.trail.visible = false; }
}
