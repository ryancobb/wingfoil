import * as THREE from 'three';

// Shared physically shaded surfaces; equipment and terrain supply their own roughness.
export function surfaceMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .02, ...extra });
}
