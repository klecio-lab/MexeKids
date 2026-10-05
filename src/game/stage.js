// Palco da Estátua Mágica — pista de dança, globo espelhado, som e banner.
// NADA de gol aqui: é boate, não estádio!
import * as THREE from 'three';

function textBanner(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#a855f7'); grad.addColorStop(0.5, '#ec4899'); grad.addColorStop(1, '#3b82f6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 160);
  g.font = '900 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#ffffff';
  g.strokeText(text, 512, 86);
  g.fillStyle = '#1e1b4b';
  g.fillText(text, 512, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStage(scene) {
  scene.background = new THREE.Color(0x12082e);
  scene.fog = new THREE.Fog(0x12082e, 22, 50);

  scene.add(new THREE.HemisphereLight(0xc4b5fd, 0x1e1b4b, 0.9));
  const spot = new THREE.DirectionalLight(0xffffff, 1.2);
  spot.position.set(4, 10, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);

  // chão escuro da boate
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x0d0620 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // pista de dança: grade de lajotas que PISCAM (materiais compartilhados)
  const tileColors = [0xec4899, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7, 0x22d3ee];
  const tileMats = tileColors.map(c => new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: c, emissiveIntensity: 1.2, roughness: 0.4
  }));
  const tileGeo = new THREE.BoxGeometry(0.72, 0.08, 0.72);
  const NX = 9, NZ = 9;
  for (let ix = 0; ix < NX; ix++) {
    for (let iz = 0; iz < NZ; iz++) {
      const m = new THREE.Mesh(tileGeo, tileMats[(ix + iz) % tileMats.length]);
      m.position.set((ix - (NX - 1) / 2) * 0.8, 0.04, 1 + (iz - (NZ - 1) / 2) * 0.8);
      m.receiveShadow = true;
      m.userData.phase = ix * 0.7 + iz * 1.1;
      scene.add(m);
      danceTiles.push(m);
    }
  }

  // globo espelhado girando
  const disco = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 1, roughness: 0.15 })
  );
  disco.position.set(0, 5.2, 3);
  scene.add(disco);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  cable.position.set(0, 7, 3);
  scene.add(cable);
  stageRefs.disco = disco;

  // fachos de luz coloridos
  const beamCols = [0xec4899, 0x22d3ee, 0xfacc15];
  beamCols.forEach((c, i) => {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 8, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    beam.position.set(-3 + i * 3, 4.5, 2 + (i % 2));
    beam.rotation.z = 0.35 - i * 0.35;
    beam.userData.baseRot = beam.rotation.z;
    scene.add(beam);
    stageRefs.beams.push(beam);
  });

  // caixas de som laterais
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });
  for (const sx of [-4.2, 4.2]) {
    const stack = new THREE.Group();
    for (let b = 0; b < 2; b++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1), boxMat);
      box.position.y = 0.6 + b * 1.25;
      box.castShadow = true;
      stack.add(box);
      for (const cy of [-0.25, 0.25]) {
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.1, 18), coneMat);
        cone.rotation.x = Math.PI / 2;
        cone.position.set(0, 0.6 + b * 1.25 + cy, -0.52);
        stack.add(cone);
      }
    }
    stack.position.set(sx, 0, 2.5);
    scene.add(stack);
  }

  // banner do show ao fundo
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.4),
    new THREE.MeshBasicMaterial({ map: textBanner('⭐ ESTÁTUA MÁGICA ⭐'), side: THREE.DoubleSide })
  );
  banner.position.set(0, 4.6, 11);
  banner.rotation.y = Math.PI; // virado pra câmera (que olha pra +z)
  scene.add(banner);

  return { tileMats };
}

// refs animáveis (piscar no ritmo) — preenchidas pelo builder
export const stageRefs = { disco: null, beams: [] };
const danceTiles = [];
export function danceFloorTiles() { return danceTiles; }
