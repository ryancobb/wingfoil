import * as THREE from 'three';
import { surfaceMaterial } from './materials.js';
import { ellipsoid, rod, tube } from './primitives.js';

// A restrained sports silhouette, built around the existing animated joint anchors.
export function createRider(board) {
  const neoprene = surfaceMaterial('#202e35', { roughness: .8 });
  const panel = surfaceMaterial('#435c63', { roughness: .7 });
  const rubber = surfaceMaterial('#14232a', { roughness: .63 });
  const shell = surfaceMaterial('#e8e8dd', { roughness: .3 });
  const face = surfaceMaterial('#bf9274', { roughness: .82 });
  const accent = surfaceMaterial('#d6884f', { roughness: .55 });
  const body = new THREE.Group(); board.add(body);
  const rings = [[-.3, .11, .09], [-.26, .158, .118], [-.17, .156, .12], [-.02, .167, .125], [.12, .215, .142], [.2, .228, .134], [.25, .195, .112], [.285, .10, .086], [.29, .069, .068]];
  const positions = [], indices = [], colors = [], sides = 24;
  const chestColor = new THREE.Color('#71878b'), baseColor = new THREE.Color('#ffffff');
  for (let r = 0; r < rings.length; r++) for (let i = 0; i <= sides; i++) {
    const angle = i / sides * Math.PI * 2, [y, width, depth] = rings[r];
    positions.push(Math.cos(angle) * width, y, Math.sin(angle) * depth);
    // Quiet shoulder and chest paneling is part of the mesh, without raised trim.
    const color = y > -.1 && y < .25 && Math.sin(angle) < -.4 ? chestColor : baseColor;
    colors.push(color.r, color.g, color.b);
    if (r < rings.length - 1 && i < sides) {
      const k = r * (sides + 1) + i;
      indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
    }
  }
  const torsoGeometry = new THREE.BufferGeometry(); torsoGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); torsoGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); torsoGeometry.setIndex(indices); torsoGeometry.computeVertexNormals();
  const torso = new THREE.Mesh(torsoGeometry, surfaceMaterial('#34464c', { roughness: .78, vertexColors: true })); torso.castShadow = true; body.add(torso);
  ellipsoid(body, neoprene, [0, -.265, 0], [.157, .102, .12]);
  rod(body, rubber, [0, .24, 0], [0, .38, 0], .067);
  // One short chest mark and a back zip give scale without busy costume details.
  rod(body, accent, [-.115, .13, -.137], [-.048, .13, -.148], .006);
  rod(body, rubber, [0, -.14, .124], [0, .225, .132], .004);

  const head = new THREE.Group(); head.position.set(0, .465, -.008); body.add(head);
  ellipsoid(head, face, [0, -.012, -.015], [.098, .127, .097]);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * .64), shell);
  helmet.scale.set(.114, .137, .116); helmet.position.set(0, .035, .005); helmet.castShadow = true; head.add(helmet);
  // A single flush lens reads cleanly at chase-camera distance.
  const lens = ellipsoid(head, surfaceMaterial('#263a42', { roughness: .17, metalness: .18 }), [0, .014, -.093], [.082, .033, .023]);
  lens.rotation.x = -.06;
  tube(head, rubber, [[-.105, .02, .015], [-.081, -.094, .001], [0, -.125, -.025], [.081, -.094, .001], [.105, .02, .015]], .006, 16);
  tube(head, panel, [[-.035, .164, .01], [0, .173, .005], [.035, .164, .01]], .004, 8);

  function limb(material, radius, lower = false) {
    const profile = lower ? [[.58, -.5], [.68, -.44], [1, -.16], [.93, .22], [.71, .46], [.58, .5]] : [[.64, -.5], [.8, -.43], [1, -.05], [.94, .28], [.74, .45], [.62, .5]];
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16), material);
    mesh.userData.radius = radius; board.add(mesh); return mesh;
  }
  const arms = [], legs = [];
  for (let i = 0; i < 2; i++) {
    const hand = ellipsoid(board, rubber, [0, 0, 0], [.04, .064, .037]);
    arms.push({ upper: limb(neoprene, .065), lower: limb(panel, .05, true), joint: ellipsoid(board, neoprene, [0, 0, 0], [.043, .047, .043]), hand });
    const foot = ellipsoid(board, rubber, [0, .18, 0], [.07, .055, .14]);
    legs.push({ upper: limb(neoprene, .089), lower: limb(neoprene, .065, true), joint: ellipsoid(board, panel, [0, 0, 0], [.06, .064, .06]), foot });
  }
  return { body, head, arms, legs };
}
