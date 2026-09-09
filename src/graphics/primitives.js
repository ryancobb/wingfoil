import * as THREE from 'three';

const sphere = new THREE.SphereGeometry(1, 20, 12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();

export function ellipsoid(parent, material, position, scale) {
  const mesh = new THREE.Mesh(sphere, material);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
}
export function link(parent, material, radius) {
  const mesh = new THREE.Mesh(cylinder, material);
  mesh.userData.radius = radius; parent.add(mesh); return mesh;
}
export function setLink(mesh, a, b, radius = mesh.userData.radius) {
  direction.subVectors(b, a);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.scale.set(radius, Math.max(.001, direction.length()), radius);
  mesh.quaternion.setFromUnitVectors(up, direction.normalize());
}
export function rod(parent, material, a, b, radius) {
  const mesh = link(parent, material, radius);
  setLink(mesh, new THREE.Vector3(...a), new THREE.Vector3(...b)); return mesh;
}
export function tube(parent, material, points, radius = .015, segments = 30) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 7, false), material);
  parent.add(mesh); return mesh;
}

// A bend pole selects the elbow/knee side; segment lengths stay fixed when reachable.
const axis = new THREE.Vector3(), bend = new THREE.Vector3();
export function solveJoint(root, end, pole, upper, lower, result) {
  axis.subVectors(end, root);
  const distance = axis.length();
  if (distance < .0001) axis.set(0, 1, 0); else axis.divideScalar(distance);
  const d = Math.max(Math.abs(upper - lower) + .0001, Math.min(distance, upper + lower - .0001));
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const perpendicular = Math.sqrt(Math.max(0, upper * upper - along * along));
  bend.subVectors(pole, root).addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < 1e-8) {
    bend.set(Math.abs(axis.x) < .8 ? 1 : 0, Math.abs(axis.x) < .8 ? 0 : 1, 0);
    bend.addScaledVector(axis, -bend.dot(axis));
  }
  bend.normalize();
  result.copy(root).addScaledVector(axis, along).addScaledVector(bend, perpendicular);
  return result;
}
