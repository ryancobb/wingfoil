import * as THREE from 'three';

// One sun direction for the sky, water reflection, and equipment lighting.
export const SUN_DIRECTION = new THREE.Vector3(.68, .48, -.55).normalize();
export const SUN_COLOR = new THREE.Color('#fff0cb');

export function createLighting(scene, renderer, shadowSize = 1024) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(new THREE.HemisphereLight('#d1edff', '#769da8', 1.1));
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 55 });
  sun.shadow.normalBias = .025;
  sun.shadow.bias = -.0002;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#c9eaff', .8);
  fill.position.set(-12, 8, 10); scene.add(fill);
  return { update(sim) {
    sun.target.position.set(sim.x, sim.y + 1, sim.z);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIRECTION, 25);
  } };
}
