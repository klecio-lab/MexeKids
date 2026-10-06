// Batedor de pênalti (minion Gobkit, CC0): idle em loop, chute no shoot.
// Clipes fatiados do bake único: idle frames 0-29, attack 30-59 @24fps.
// Tudo com guardas: se o GLB falhar, o jogo segue idêntico sem ele.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadKicker(scene, { x = 0, z = 11, height = 2.0 } = {}) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/models/kicker.glb');
  const model = gltf.scene;
  // normaliza altura (minions têm tamanhos variados)
  const box = new THREE.Box3().setFromObject(model);
  const s = height / Math.max(0.001, box.max.y - box.min.y);
  model.scale.setScalar(s);
  // origem do GLB nem sempre é nos pés: assenta a sola no chão
  model.position.set(x, -box.min.y * s, z);
  model.rotation.y = Math.PI; // confere no screenshot (nativo olha +Z)
  model.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const src = gltf.animations?.[0] || null;
  let idleAction = null, attackAction = null;
  if (src) {
    try {
      const idle = THREE.AnimationUtils.subclip(src, 'idle', 0, 29, 24);
      const atk = THREE.AnimationUtils.subclip(src, 'attack', 30, 59, 24);
      idleAction = mixer.clipAction(idle);
      idleAction.play();
      attackAction = mixer.clipAction(atk);
      attackAction.setLoop(THREE.LoopOnce, 1);
      attackAction.clampWhenFinished = true;
    } catch { /* sem anim: estático, jogo segue igual */ }
  }
  let retimer = 0;
  return {
    group: model,
    setX(nx) { model.position.x = nx; },
    kick() {
      if (!attackAction || !idleAction) return;
      try {
        attackAction.reset().play();
        clearTimeout(retimer);
        retimer = setTimeout(() => { try { idleAction.reset().play(); } catch {} }, 1300);
      } catch {}
    },
    update(dt) { try { mixer.update(dt); } catch {} }
  };
}
