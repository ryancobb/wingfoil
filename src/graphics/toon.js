import * as THREE from 'three';

// Nearest filtering preserves three deliberate light bands, even on curved gear.
const ramp = new THREE.DataTexture(new Uint8Array([80, 165, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false; ramp.needsUpdate = true;
export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
}
