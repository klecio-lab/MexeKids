// Estádio 3D: campo, gol FIXO, traves, rede, arquibancada simples
import * as THREE from 'three';
import { GOAL_W, GOAL_H } from '../vision/tracking.js';

export function buildStadium(scene) {
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x9fd4ef, 25, 70);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a7d2c, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  // Céu em gradiente (dome) + sol + nuvens à deriva
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2f7fe0) }, bottom: { value: new THREE.Color(0xd8f3ff) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.02,0.5,h)), 1.0); }'
    })
  );
  scene.add(sky);
  const sunBall = new THREE.Mesh(
    new THREE.CircleGeometry(3, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff7c2, fog: false })
  );
  sunBall.position.set(-24, 26, 40);
  sunBall.lookAt(0, 2, -4);
  scene.add(sunBall);
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  const cloudSpots = [[-14, 14, 22, 1.4], [-4, 17, 28, 1.9], [7, 13, 24, 1.2], [16, 16, 30, 1.6], [2, 19, 34, 2.2]];
  for (const [cx, cy, cz, cs] of cloudSpots) {
    const puff = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 - Math.abs(i - 1) * 0.4, 14, 12), cloudMat);
      b.position.set((i - 1) * 1.5, (i % 2) * 0.4, 0);
      b.scale.y = 0.6;
      puff.add(b);
    }
    puff.position.set(cx, cy, cz);
    puff.scale.setScalar(cs);
    scene.add(puff);
    clouds.push(puff);
  }

  // Gramado com textura de grama (ruído via canvas)
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 0.9 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  // Listras do gramado
  for (let i = -4; i <= 4; i++) {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 40),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x46b455 : 0x3a9448 })
    );
    s.rotation.x = -Math.PI / 2;
    s.position.set(i * 3.6, 0.001, 0);
    s.receiveShadow = true;
    scene.add(s);
  }

  // Linha do gol + área
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mkLine = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z);
    scene.add(m);
  };
  mkLine(GOAL_W + 4, 0.12, 0, 2.5);           // linha de fundo área
  mkLine(0.12, 6, -(GOAL_W / 2 + 2), 5.2);    // laterais área
  mkLine(0.12, 6, (GOAL_W / 2 + 2), 5.2);

  // Gol FIXO
  const goal = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, GOAL_H, 16);
  const mkPost = (x) => {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(x, GOAL_H / 2, 0); p.castShadow = true;
    goal.add(p);
  };
  mkPost(-GOAL_W / 2); mkPost(GOAL_W / 2);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_W + 0.14, 16), postMat);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, GOAL_H, 0); bar.castShadow = true;
  goal.add(bar);

  // Rede (textura grade via canvas)
  // NOTA: sem rede de FUNDO — a câmera fica dentro do gol (visão do goleiro)
  // e olharia através dela o jogo todo. Laterais + teto continuam.
  const netTex = makeNetTexture();
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(14, 6);
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 1.25), netMat);
  top.rotation.x = Math.PI / 2 - 0.25; top.position.set(0, GOAL_H - 0.1, -0.6);
  goal.add(top);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(1.25, GOAL_H), netMat);
    side.rotation.y = Math.PI / 2;
    side.position.set(sx * GOAL_W / 2, GOAL_H / 2, -0.6);
    goal.add(side);
  }
  scene.add(goal);

  // Arquibancada + bandeirinhas AO FUNDO do campo (a câmera fica dentro do
  // gol olhando pra frente, então a torcida aparece lá longe, atrás da bola)
  const standMat = new THREE.MeshStandardMaterial({ color: 0x1e40af });
  for (let r = 0; r < 3; r++) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(44, 1.4, 2), standMat.clone());
    stand.material.color.offsetHSL(0, 0, r * 0.06);
    stand.position.set(0, 3.2 + r * 1.5, 22 + r * 2.2);
    scene.add(stand);
  }
  const flagColors = [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7];
  for (let i = 0; i < 20; i++) {
    const f = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.02),
      new THREE.MeshBasicMaterial({ color: flagColors[i % flagColors.length] })
    );
    f.position.set(-13 + i * 1.35, 6.4 + Math.sin(i) * 0.3, 21.5);
    f.rotation.y = Math.PI; // viradas pra câmera (que olha pra +z)
    scene.add(f);
  }
  // Torcida: bonequinhos coloridos nas arquibancadas (1 draw call via InstancedMesh)
  // updateCrowd(t, amp): faz pular (amp sobe no gol/defesa!)
  const crowdCtl = { update: () => {} };
  {
    const perRow = 26;
    const count = perRow * 3;
    const crowd = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.45, 0.7, 0.3),
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      count
    );
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const base = new Float32Array(count * 3);
    let ci = 0;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < perRow; i++) {
        const x = -16 + i * 1.28 + (r % 2) * 0.6;
        const y = 4.25 + r * 1.5;
        const z = 22 + r * 2.2;
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        crowd.setMatrixAt(ci, dummy.matrix);
        crowd.setColorAt(ci, col.setHex(flagColors[(i * 3 + r * 2) % flagColors.length]));
        base[ci * 3] = x; base[ci * 3 + 1] = y; base[ci * 3 + 2] = z;
        ci++;
      }
    }
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    scene.add(crowd);
    crowdCtl.update = (t, amp) => {
      for (let i = 0; i < count; i++) {
        dummy.position.set(
          base[i * 3],
          base[i * 3 + 1] + Math.abs(Math.sin(t * 3 + i * 0.7)) * amp,
          base[i * 3 + 2]
        );
        dummy.updateMatrix();
        crowd.setMatrixAt(i, dummy.matrix);
      }
      crowd.instanceMatrix.needsUpdate = true;
    };
  }
  // Árvores nas bordas (profundidade de graça)
  {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1d7a33, roughness: 0.8 });
    for (const [tx, tz, ts] of [[-15, 4, 1.2], [15, 5, 1.4], [-16, 14, 1.1], [16, 15, 1.3]]) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * ts, 0.24 * ts, 1.4 * ts, 8), trunkMat);
      trunk.position.y = 0.7 * ts;
      trunk.castShadow = true;
      tree.add(trunk);
      for (let c = 0; c < 2; c++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((1.1 - c * 0.3) * ts, 1.2 * ts, 10), leafMat);
        cone.position.y = (1.6 + c * 0.8) * ts;
        cone.castShadow = true;
        tree.add(cone);
      }
      tree.position.set(tx, 0, tz);
      scene.add(tree);
    }
  }
  // Refletores (só visual, sem luz extra = sem custo)
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1.4 });
    for (const sx of [-1, 1]) {
      // afastados e altos: aparecem pequenos no fundo, sem invadir a cena
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 10), poleMat);
      pole.position.set(sx * 14, 3, 14);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.3), lampMat);
      head.position.set(sx * 14, 6.2, 14);
      head.lookAt(0, 1, 4);
      scene.add(head);
    }
  }
  // Marca do pênalti (de onde saem as bolas)
  {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), lineMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.012, 11);
    scene.add(spot);
  }
  // Placas de publicidade nas laterais do campo
  const adColors = [0xef4444, 0xfacc15, 0x3b82f6];
  for (let i = 0; i < 6; i++) {
    const ad = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.9, 0.1),
      new THREE.MeshStandardMaterial({ color: adColors[i % adColors.length] })
    );
    ad.position.set(i < 3 ? -8.5 : 8.5, 0.45, 4 + (i % 3) * 5);
    ad.rotation.y = i < 3 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(ad);
  }
  return { goal, updateCrowd: crowdCtl.update, clouds };
}

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3fa34d';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? '#37973f' : (v < 0.8 ? '#46b455' : '#2f8a3a');
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeNetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
