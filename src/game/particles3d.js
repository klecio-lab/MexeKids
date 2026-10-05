// Partículas 3D — confete na defesa, fumaça no gol
import * as THREE from 'three';

export class Particles3D {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.02);
    this.geo = geo;
  }
  burst(pos, n = 60, colors = [0xfacc15, 0x22c55e, 0x3b82f6, 0xef4444, 0xa855f7]) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      m.position.copy(pos);
      m.userData = {
        v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 1, (Math.random() - 0.5) * 4),
        life: 1 + Math.random() * 0.6,
        spin: (Math.random() - 0.5) * 10
      };
      this.scene.add(m);
      this.parts.push(m);
    }
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const m = this.parts[i];
      m.userData.life -= dt;
      m.userData.v.y -= 7 * dt;
      m.position.addScaledVector(m.userData.v, dt);
      m.rotation.x += m.userData.spin * dt;
      m.rotation.y += m.userData.spin * dt;
      if (m.userData.life <= 0 || m.position.y < 0) {
        this.scene.remove(m);
        m.material.dispose();
        this.parts.splice(i, 1);
      }
    }
  }
}
