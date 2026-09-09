import * as THREE from 'three';
import { ellipsoid } from './primitives.js';

export function createEnvironment(scene) {
  const skyTime = { value: 0 };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1250, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: skyTime, horizon: { value: new THREE.Color('#addde0') }, zenith: { value: new THREE.Color('#4389b6') } },
    vertexShader: `varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;uniform vec3 horizon,zenith;varying vec3 vDir;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(vDir);float h=max(0.,d.y);vec3 col=mix(horizon,zenith,pow(h,.45));
        vec2 p=d.xz/(h+.22)*2.5+vec2(uTime*.006,0.);float n=noise(p)*.64+noise(p*2.1)*.25+noise(p*4.2)*.11;
        float clouds=smoothstep(.57,.72,n)*smoothstep(.04,.22,h);col=mix(col,vec3(.86,.93,.84),clouds*.82);
        vec3 sun=normalize(vec3(-.4,.36,-.8));float disc=pow(max(dot(d,sun),0.),700.);float glow=pow(max(dot(d,sun),0.),12.);
        col+=vec3(1.,.75,.39)*(disc*.6+glow*.08);gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })); sky.renderOrder = -1000; sky.frustumCulled = false; scene.add(sky);
  const sand = new THREE.MeshStandardMaterial({ color: '#d9c797', roughness: 1 });
  const rock = new THREE.MeshStandardMaterial({ color: '#71867e', roughness: 1, flatShading: true });
  const forest = new THREE.MeshStandardMaterial({ color: '#4f8470', roughness: 1, flatShading: true });
  const grass = new THREE.MeshStandardMaterial({ color: '#6b9c77', roughness: 1, flatShading: true });
  const islands = [[440, -120, 1], [180, -520, 1.1], [-330, -480, .8], [-560, 150, 1.4], [630, 510, .65]];
  for (let i = 0; i < islands.length; i++) {
    const [x, z, scale] = islands[i], group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group);
    ellipsoid(group, sand, [0, -.8, 0], [94, 4.5, 49]);
    for (let n = 0; n < 7; n++) {
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), n % 2 ? forest : grass);
      hill.position.set((n - 3) * 22, 2, Math.sin(n * 5) * 13); hill.scale.set(28, 16 + Math.sin(n * 2.4 + i) * 10 + (n === 3 ? 20 : 0), 27); group.add(hill);
    }
    for (let n = 0; n < 9; n++) {
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rock);
      boulder.position.set(Math.sin(n * 4.13) * 79, .6, Math.cos(n * 4.13) * 36); boulder.scale.set(4 + n % 3, 4 + n % 4, 5); group.add(boulder);
    }
  }
  return { update(sim, camera) { sky.position.copy(camera.position); skyTime.value = sim.time; } };
}
