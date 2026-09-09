import * as THREE from 'three';
import { surfaceMaterial } from './materials.js';
import { WATER_GLSL } from '../water.js';

const ISLANDS = [[330, -90, 1], [160, -430, 1.1], [-330, -400, .8], [-500, 150, 1.4], [540, 410, .65]];
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const coast = (angle, seed) => 75 * (1 + .09 * Math.sin(angle * 3 + seed) + .055 * Math.sin(angle * 5 - seed * 2) + .025 * Math.sin(angle * 9 + seed));

// A continuous island surface: low beaches, eroded rock shelves and an uneven ridge.
function terrain(x, z, seed) {
  const angle = Math.atan2(z / .67, x), radius = Math.hypot(x, z / .67) / coast(angle, seed);
  const beach = 2.8 - smooth(.79, 1.04, radius) * 5.2;
  const peak = (px, pz, width, height) => height * Math.exp(-((x - px) ** 2 + (z - pz) ** 2 * 1.45) / (width * width));
  const ridge = peak(-12 + Math.sin(seed * 2) * 9, 7, 25, 34 + Math.sin(seed) * 6) + peak(25, -3 - Math.sin(seed) * 7, 21, 23) + peak(-36, -7, 17, 15);
  const erosion = (Math.sin(x * .17 + Math.sin(z * .13)) * .7 + Math.sin(z * .24 + x * .11) * .35) * smooth(3, 15, ridge);
  const raw = Math.max(0, ridge + erosion), tier = Math.floor(raw / 9), fraction = raw / 9 - tier;
  const shelves = tier * 9 + 9 * smooth(.12, .88, fraction);
  return beach + (raw * .72 + shelves * .28) * (1 - smooth(.7, .92, radius));
}

function terrainGeometry(seed) {
  const segments = 80, rings = 36, positions = [], colors = [], indices = [];
  const sand = new THREE.Color('#efd7a1'), wetSand = new THREE.Color('#aaab83');
  const rock = new THREE.Color('#736d55'), lightRock = new THREE.Color('#a09270');
  const grass = new THREE.Color('#568e35'), darkGrass = new THREE.Color('#2f7143'), color = new THREE.Color(), green = new THREE.Color();
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2, radius = coast(angle, seed) * j / rings * 1.045;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius * .67, y = terrain(x, z, seed);
    positions.push(x, y, z);
    const slope = Math.hypot(terrain(x + .5, z, seed) - terrain(x - .5, z, seed), terrain(x, z + .5, seed) - terrain(x, z - .5, seed));
    const strata = .5 + .5 * Math.sin(y * 1.35 + Math.sin(x * .18) * .6);
    color.copy(rock).lerp(lightRock, .25 + strata * .4);
    const vegetation = (1 - smooth(.7, 2.2, slope)) * smooth(2.8, 6, y);
    color.lerp(green.copy(darkGrass).lerp(grass, .5 + Math.sin(x * .16 + z * .21) * .3), vegetation);
    color.lerp(sand, 1 - smooth(2, 4, y));
    color.lerp(wetSand, (1 - smooth(-.7, 1.2, y)) * .65);
    colors.push(color.r, color.g, color.b);
    if (j < rings && i < segments) { const k = j * (segments + 1) + i; indices.push(k, k + 1, k + segments + 1, k + 1, k + segments + 2, k + segments + 1); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  // Weld the polar seam's lighting without changing vertex color boundaries.
  const normals = geometry.attributes.normal, normal = new THREE.Vector3();
  for (let j = 0; j <= rings; j++) {
    const a = j * (segments + 1), b = a + segments;
    normal.fromBufferAttribute(normals, a).add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z); normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
  return geometry;
}

function frondGeometry() {
  const positions = [], indices = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6, width = Math.sin(u * Math.PI) * .78;
    const y = Math.sin(u * Math.PI) * 1.1 - u * u * 1.8;
    positions.push(-width, y - width * .35, u * 6, 0, y, u * 6, width, y - width * .35, u * 6);
    if (i < 6) { const k = i * 3; indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function createIslands(scene) {
  const time = { value: 0 }, chop = { value: .6 }, rider = { value: new THREE.Vector2() }, wind = { value: 10 };
  const landMaterial = surfaceMaterial('#ffffff', { vertexColors: true, roughness: .95 });
  landMaterial.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vIslandPosition;varying float vIslandUp;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      vIslandPosition=position;vIslandUp=normal.y;`);
    shader.fragmentShader = `varying vec3 vIslandPosition;varying float vIslandUp;
      float islandHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float islandNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(islandHash(i),islandHash(i+vec2(1,0)),f.x),mix(islandHash(i+vec2(0,1)),islandHash(i+vec2(1,1)),f.x),f.y);}
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 islandP=vIslandPosition;
        float broad=islandNoise(islandP.xz*.21)*.65+islandNoise(islandP.xz*.53)*.35;
        float rockFace=1.-smoothstep(.6,.85,vIslandUp);
        float strata=smoothstep(.35,.55,sin(islandP.y*2.4+broad*2.)*.5+.5);
        float footprint=max(length(dFdx(islandP)),length(dFdy(islandP)));
        float detailFade=1.-smoothstep(.3,1.5,footprint);
        float grain=islandNoise(islandP.xz*3.7+islandP.y*.8);
        diffuseColor.rgb*=.79+broad*.29+grain*.10*detailFade-rockFace*strata*.1;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float surfaceGrain=islandNoise(islandP.xz*1.9+islandP.y*.7)*detailFade*.12;
        vec3 sigmaX=dFdx(-vViewPosition),sigmaY=dFdy(-vViewPosition);
        vec3 r1=cross(sigmaY,normal),r2=cross(normal,sigmaX);
        float determinant=dot(sigmaX,r1);
        normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(surfaceGrain)*r1+dFdy(surfaceGrain)*r2));`);
  };
  const trunkMaterial = surfaceMaterial('#8f7956', { roughness: .95 });
  const leafMaterial = surfaceMaterial('#7fa84a', { side: THREE.DoubleSide, roughness: .8 });
  leafMaterial.onBeforeCompile = shader => {
    shader.uniforms.uIslandTime = time; shader.uniforms.uIslandWind = wind;
    shader.vertexShader = `uniform float uIslandTime,uIslandWind;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      float phase=instanceMatrix[3].x*.07+instanceMatrix[3].z*.09;
      transformed.x+=sin(uIslandTime*1.8+phase+position.z*.5)*pow(position.z/6.,2.)*min(uIslandWind*.025,.45);
      transformed.y+=sin(uIslandTime*1.3+phase+position.z*.7)*position.z*.025;`);
  };
  const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(.15, 3, 0), new THREE.Vector3(.55, 6, .08), new THREE.Vector3(1.1, 9, .2)]);
  const trunks = new THREE.InstancedMesh(new THREE.TubeGeometry(trunkCurve, 8, .24, 5, false), trunkMaterial, ISLANDS.length * 10);
  const leaves = new THREE.InstancedMesh(frondGeometry(), leafMaterial, ISLANDS.length * 10 * 7);
  const shrubGeometry = new THREE.IcosahedronGeometry(1, 1), shrubPositions = shrubGeometry.attributes.position;
  for (let i = 0; i < shrubPositions.count; i++) {
    const x = shrubPositions.getX(i), y = shrubPositions.getY(i), z = shrubPositions.getZ(i);
    const lobes = 1 + Math.sin(x * 7 + z * 5) * .13 + Math.cos(y * 8 - z * 6) * .09;
    shrubPositions.setXYZ(i, x * lobes, y * lobes, z * lobes);
  }
  shrubGeometry.computeVertexNormals();
  const bushes = new THREE.InstancedMesh(shrubGeometry, surfaceMaterial('#77975a', { roughness: .9 }), ISLANDS.length * 24);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), surfaceMaterial('#b4ab8e', { roughness: .95, flatShading: true }), ISLANDS.length * 10);
  scene.add(trunks, leaves, bushes, rocks);
  const dummy = new THREE.Object3D(), tint = new THREE.Color(); let treeIndex = 0, leafIndex = 0, bushIndex = 0, rockIndex = 0;

  const shoreMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: time, uChop: chop, uRider: rider },
    vertexShader: `${WATER_GLSL} uniform float uTime,uChop;uniform vec2 uRider;varying vec2 vUv;varying float vDistance;
      void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);p.y=renderedWaterSurface(p.xz,uTime,uChop,p.xz-uRider).x+.045;
        vec4 view=viewMatrix*p;vDistance=length(view.xyz);gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float uTime,uChop;varying vec2 vUv;varying float vDistance;
      void main(){float along=vUv.x*6.283185;float shore=vUv.y;
        float wash=shore*3.+uTime*.16+sin(along*7.)*.1+sin(along*19.)*.06;
        float line=abs(fract(wash)-.5),aa=max(fwidth(wash),.008);
        float foam=(1.-smoothstep(.025,.025+aa,line))*(.55+.45*sin(along*41.+sin(along*13.)*2.));
        foam*=1.-smoothstep(.15,.95,shore);
        float reef=(1.-smoothstep(.0,1.,shore))*.2;
        vec3 color=mix(vec3(.055,.3,.25),vec3(.85,.93,.91),foam);
        color=mix(color,vec3(.376,.584,.701),1.-exp(-vDistance*.0012));
        float alpha=max(reef,foam*(.45+min(uChop,1.)*.15))*smoothstep(0.,.08,shore);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for (const [seed, [x, z, scale]] of ISLANDS.entries()) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group);
    group.add(new THREE.Mesh(terrainGeometry(seed), landMaterial));
    const shorePositions = [], shoreUV = [], shoreIndices = [];
    for (let j = 0; j <= 4; j++) for (let i = 0; i <= 64; i++) {
      const angle = i / 64 * Math.PI * 2, r = coast(angle, seed) * (.955 + j / 4 * .3);
      shorePositions.push(Math.cos(angle) * r, 0, Math.sin(angle) * r * .67); shoreUV.push(i / 64, j / 4);
      if (j < 4 && i < 64) { const k = j * 65 + i; shoreIndices.push(k, k + 1, k + 65, k + 1, k + 66, k + 65); }
    }
    const shoreGeometry = new THREE.BufferGeometry(); shoreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shorePositions, 3)); shoreGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(shoreUV, 2)); shoreGeometry.setIndex(shoreIndices);
    const shore = new THREE.Mesh(shoreGeometry, shoreMaterial); shore.renderOrder = 1; group.add(shore);
    // Shared instanced foliage and rocks keep the archipelago to a handful of calls.
    for (let n = 0; n < 24; n++) {
      const angle = n * 2.399 + seed, r = 14 + (n * 17 % 39);
      const px = Math.cos(angle) * r, pz = Math.sin(angle) * r * .63, y = terrain(px, pz, seed);
      dummy.position.set(x + px * scale, (y + .25) * scale, z + pz * scale); dummy.rotation.set(.1, angle, -.1);
      dummy.scale.set((4.8 + n % 3) * scale, (1.4 + n % 4 * .4) * scale, (4.5 + n % 2) * scale); dummy.updateMatrix(); bushes.setMatrixAt(bushIndex, dummy.matrix);
      tint.setHSL(.26 + Math.sin(n * 4) * .025, .38, .65 + Math.sin(n * 9) * .1); bushes.setColorAt(bushIndex++, tint);
    }
    for (let n = 0; n < 10; n++) {
      const angle = n * 2.399 + seed, radius = coast(angle, seed), px = Math.cos(angle) * radius * .79, pz = Math.sin(angle) * radius * .79 * .67;
      const y = terrain(px, pz, seed), size = (.85 + n % 4 * .14) * scale;
      dummy.position.set(x + px * scale, y * scale, z + pz * scale); dummy.rotation.set(0, angle, 0); dummy.scale.set(size, size, size); dummy.updateMatrix(); trunks.setMatrixAt(treeIndex++, dummy.matrix);
      const crownX = dummy.position.x + (Math.cos(angle) * 1.1 + Math.sin(angle) * .2) * size;
      const crownZ = dummy.position.z + (-Math.sin(angle) * 1.1 + Math.cos(angle) * .2) * size;
      for (let leaf = 0; leaf < 7; leaf++) {
        dummy.position.set(crownX, y * scale + 9 * size, crownZ); dummy.rotation.set((leaf % 3 - 1) * .12, angle + leaf / 7 * Math.PI * 2, .08); dummy.scale.setScalar(size); dummy.updateMatrix(); leaves.setMatrixAt(leafIndex++, dummy.matrix);
      }
      const rx = Math.cos(angle + .12) * radius * .92, rz = Math.sin(angle + .12) * radius * .92 * .67;
      dummy.position.set(x + rx * scale, (terrain(rx, rz, seed) + .45) * scale, z + rz * scale); dummy.rotation.set(n * .7, angle, n * .3); dummy.scale.set((1.5 + n % 3) * scale, (1.2 + n % 2) * scale, (1.8 + n % 3) * scale); dummy.updateMatrix(); rocks.setMatrixAt(rockIndex++, dummy.matrix);
    }
  }
  return { update(sim) { time.value = sim.time; chop.value = sim.settings.chop; rider.value.set(sim.x, sim.z); wind.value = sim.telemetry.wind || 0; } };
}
