// Arena do Queimado: QUADRA DA ESCOLA (não estádio!)
// Cimento pintado com linhas, muro de tijolo, faixa "QUEIMADO MALUCO",
// colegas torcendo na muretinha, bola ao cesto de reserva.
// Mesmo formato do stadium: retorna { updateCrowd, clouds }.
import * as THREE from 'three';

function courtTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2f9e6e'; g.fillRect(0, 0, 512, 512); // verde quadra
  g.fillStyle = '#3b82f6';
  g.fillRect(56, 56, 400, 400); // miolo azul
  g.strokeStyle = '#ffffff'; g.lineWidth = 8;
  g.strokeRect(56, 56, 400, 400);
  g.beginPath(); g.moveTo(256, 56); g.lineTo(256, 456); g.stroke(); // meio
  g.beginPath(); g.arc(256, 256, 70, 0, Math.PI * 2); g.stroke();   // círculo
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function brickTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b45309'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#92400e';
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      if ((x + y) % 2 === 0) g.fillRect(x * 32 + (y % 2) * 16 - 16, y * 16 + 2, 28, 12);
  g.fillStyle = '#fbbf24'; g.fillRect(0, 0, 256, 10); // faixinha amarela no topo
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#1e3a8a'; g.fillRect(0, 0, 1024, 192);
  g.strokeStyle = '#fbbf24'; g.lineWidth = 10; g.strokeRect(10, 10, 1004, 172);
  g.font = '900 96px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fbbf24';
  g.fillText('QUEIMADO MALUCO', 512, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDodgeArena(scene) {
  // fim de tarde na escola: céu quente
  scene.background = new THREE.Color(0xffd9a0);
  scene.fog = new THREE.Fog(0xffd9a0, 28, 75);

  scene.add(new THREE.HemisphereLight(0xfff2d9, 0x8a6b4a, 0.95));
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.6);
  sun.position.set(-8, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  // sol baixo + nuvens
  const sunBall = new THREE.Mesh(
    new THREE.CircleGeometry(2.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9d45, fog: false })
  );
  sunBall.position.set(-20, 12, 45);
  sunBall.lookAt(0, 2, -4);
  scene.add(sunBall);
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.92, fog: false });
  for (const [cx, cy, cz, cs] of [[-12, 15, 25, 1.3], [4, 17, 30, 1.8], [14, 14, 26, 1.1]]) {
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

  // chão: concreto em volta + quadra pintada no meio
  const concrete = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 50),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 1 })
  );
  concrete.rotation.x = -Math.PI / 2;
  concrete.position.y = -0.02;
  concrete.receiveShadow = true;
  scene.add(concrete);
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 16),
    new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.9 })
  );
  court.rotation.x = -Math.PI / 2;
  court.receiveShadow = true;
  scene.add(court);

  // muro de tijolo em volta (alto atrás, baixo nas laterais p/ ver os colegas)
  const brick = brickTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 });
  const mkWall = (w, h, x, y, z, ry, repX) => {
    const m = wallMat.clone();
    m.map = brick.clone();
    m.map.needsUpdate = true;
    m.map.repeat.set(repX, h / 2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), m);
    wall.position.set(x, y, z);
    wall.rotation.y = ry;
    scene.add(wall);
    return wall;
  };
  mkWall(34, 5, 0, 2.5, 17, 0, 12);          // fundão (atrás da ação)
  mkWall(30, 1.2, -15, 0.6, 4, Math.PI / 2, 10);  // muretinha esquerda
  mkWall(30, 1.2, 15, 0.6, 4, Math.PI / 2, 10);    // muretinha direita

  // FAIXA do jogo no fundão
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 2.6),
    new THREE.MeshBasicMaterial({ map: bannerTexture() })
  );
  banner.position.set(0, 3.4, 16.75);
  banner.rotation.y = Math.PI;
  scene.add(banner);

  // cesto de bolas reserva (pirâmide de bolas de borracha)
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
  const ballGeo = new THREE.SphereGeometry(0.22, 16, 12);
  const rack = new THREE.Group();
  const rows = [[-5.5, 3], [-5.5, 2], [-5.5, 1]];
  let bi = 0;
  for (const [bx, n] of rows) {
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(ballGeo, ballMat);
      b.position.set(bx + i * 0.5 - n * 0.25, 0.22 + bi * 0.38, 6);
      b.castShadow = true;
      rack.add(b);
    }
    bi++;
  }
  scene.add(rack);

  // COLEGAS torcendo sentados nas muretinhas (cabem no bolso: esfera + caixa)
  const pals = [];
  const shirtCols = [0xef4444, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7, 0xec4899];
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffc490, roughness: 0.7 });
  let pi = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const shirt = new THREE.MeshStandardMaterial({ color: shirtCols[pi % shirtCols.length], roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.3), shirt);
      body.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skinMat);
      head.position.y = 1.05;
      g.add(body, head);
      g.position.set(side * 15, 1.2, -2 + i * 2.2);
      g.rotation.y = -side * Math.PI / 2;
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(g);
      pals.push({ g, base: 1.2, ph: pi * 1.7 });
      pi++;
    }
  }

  function updateCrowd(t, amp = 1) {
    for (const p of pals) {
      p.g.position.y = p.base + Math.abs(Math.sin(t * 3 + p.ph)) * 0.25 * amp;
    }
  }

  return { updateCrowd, clouds };
}
