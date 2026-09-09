import * as THREE from 'three';
import { toon } from './toon.js';

export function createEnvironment(scene) {
  const skyTime = { value: 0 };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1250, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: skyTime, horizon: { value: new THREE.Color('#92e4ef') }, zenith: { value: new THREE.Color('#1474d4') } },
    vertexShader: `varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;uniform vec3 horizon,zenith;varying vec3 vDir;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(vDir);float h=max(0.,d.y);vec3 col=mix(horizon,zenith,pow(h,.55));
        // Broad scalloped silhouettes and a crisp blue shadow under each cloud.
        vec2 p=d.xz/(h+.32)*3.4+vec2(uTime*.004,0.);
        float n=noise(p)*.78+noise(p*2.3)*.22;
        float aa=max(fwidth(n),.003);
        float clouds=smoothstep(.58-aa,.58+aa,n)*smoothstep(.035,.12,h);
        vec3 cloud=mix(vec3(.57,.80,.91),vec3(1.,.98,.86),smoothstep(.63-aa,.63+aa,n));
        col=mix(col,cloud,clouds);
        float sun=dot(d,normalize(vec3(-.4,.36,-.8)));
        col=mix(col,vec3(1.,.93,.60),smoothstep(.9983,.9986,sun));
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`,
  })); sky.renderOrder = -1000; sky.frustumCulled = false; scene.add(sky);
  const sand = toon('#ffe3a0'), cliff = toon('#b98b53', { flatShading: true });
  const grass = toon('#80cc37', { flatShading: true }), grassDark = toon('#39974a', { flatShading: true });
  const trunkMat = toon('#92613c'), leafMat = toon('#36a95b', { side: THREE.DoubleSide });
  const islands = [[330, -90, 1], [160, -430, 1.1], [-330, -400, .8], [-500, 150, 1.4], [540, 410, .65]];
  const trunkGeo = new THREE.CylinderGeometry(.42, .75, 1, 5);
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, -1.4,.5,3, 0,1.4,3.3, 1.4,.5,3, 0,-.8,7.2], 3));
  leafGeo.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]); leafGeo.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, islands.length * 6);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, islands.length * 6 * 5);
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), grassDark, islands.length * 3 * 4);
  scene.add(trunks, leaves, bushes); let bushIndex = 0;
  const dummy = new THREE.Object3D(); let treeIndex = 0, leafIndex = 0;
  const shores = [];
  for (let i = 0; i < islands.length; i++) {
    const [x, z, scale] = islands[i], group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group);
    function terrace(px, pz, radius, height, y, material, topRadius = radius) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, radius, height, 9), material);
      mesh.position.set(px, y, pz); mesh.scale.z = .67; mesh.rotation.y = .18; group.add(mesh); return mesh;
    }
    terrace(0, 0, 76, 3.5, .8, sand, 69);
    for (let n = 0; n < 3; n++) {
      const px = (n - 1) * 32, pz = Math.sin(n * 4 + i) * 8, h = 17 + (n === 1 ? 23 : 0) + Math.sin(i + n) * 5;
      terrace(px, pz, 30, h, h / 2, cliff, 25);
      terrace(px, pz, 27, 2.5, h, n === 1 ? grassDark : grass, 24);
      for (let b = 0; b < 4; b++) {
        dummy.position.set(x + (px + Math.sin(b * 2.2) * 15) * scale, (h + 2) * scale, z + (pz + Math.cos(b * 2.2) * 9) * scale);
        dummy.rotation.set(0, b, 0); dummy.scale.set(6 * scale, (3 + b % 2 * 3) * scale, 5 * scale); dummy.updateMatrix(); bushes.setMatrixAt(bushIndex++, dummy.matrix);
      }
    }
    const shore = new THREE.Mesh(new THREE.RingGeometry(1, 1.045, 64), new THREE.MeshBasicMaterial({ color: '#f0ffdd', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
    shore.rotation.x = -Math.PI / 2; shore.position.set(x, .12, z); scene.add(shore); shores.push({ mesh: shore, scale });
    // Palms share two draw calls across the entire archipelago.
    for (let n = 0; n < 6; n++) {
      const angle = n * 2.4 + i, tx = x + Math.cos(angle) * 56 * scale, tz = z + Math.sin(angle) * 30 * scale;
      const h = (9 + n % 3 * 2) * scale;
      dummy.position.set(tx, h / 2 + 2 * scale, tz); dummy.rotation.set(.1 * Math.cos(angle), 0, .12 * Math.sin(angle)); dummy.scale.set(scale, h, scale); dummy.updateMatrix(); trunks.setMatrixAt(treeIndex++, dummy.matrix);
      for (let leaf = 0; leaf < 5; leaf++) {
        dummy.position.set(tx + Math.sin(angle) * -h * .06, h + 2 * scale, tz + Math.cos(angle) * h * .05);
        dummy.rotation.set(0, leaf / 5 * Math.PI * 2 + angle, 0); dummy.scale.setScalar(scale); dummy.updateMatrix(); leaves.setMatrixAt(leafIndex++, dummy.matrix);
      }
    }
  }
  return { update(sim, camera) {
    sky.position.copy(camera.position); skyTime.value = sim.time;
    for (const { mesh, scale } of shores) {
      const surge = 1 + Math.sin(sim.time * .7) * .018;
      mesh.scale.set(80 * scale * surge, 52 * scale * surge, 1);
    }
  } };
}
