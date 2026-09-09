import * as THREE from 'three';
import { createIslands } from './islands.js';
import { SUN_DIRECTION } from './lighting.js';

export function createEnvironment(scene, renderer, reflectionSize = 128) {
  const skyTime = { value: 0 };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1250, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: skyTime, uSun: { value: SUN_DIRECTION }, horizon: { value: new THREE.Color('#a5c9da') }, zenith: { value: new THREE.Color('#185fae') } },
    vertexShader: `varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;uniform vec3 horizon,zenith,uSun;varying vec3 vDir;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(vDir);float h=max(0.,d.y);vec3 col=mix(horizon,zenith,pow(h,.55));
        // Layered cloud density gives the banks softly lit edges and blue undersides.
        vec2 p=d.xz/(h+.24)*3.4+vec2(uTime*.004,0.);
        float n=noise(p)*.52+noise(p*2.03)*.27+noise(p*4.11)*.13+noise(p*8.21)*.06+noise(p*16.4)*.02;
        float aa=max(fwidth(n),.003);
        float clouds=smoothstep(.48-aa,.64+aa,n)*smoothstep(.025,.12,h);
        float lighting=smoothstep(.48,.7,n)+.25*(noise(p+uSun.xz*.25)-noise(p-uSun.xz*.25));
        vec3 cloud=mix(vec3(.44,.55,.67),vec3(1.65,1.58,1.4),clamp(lighting,0.,1.));
        float sun=clamp(dot(d,uSun),0.,1.);
        cloud+=vec3(1.,.71,.35)*pow(sun,12.)*.45;
        col=mix(col,cloud,clouds);
        col+=vec3(1.,.67,.28)*(pow(sun,9.)*.22+pow(sun,96.)*.6);
        col+=vec3(6.,4.8,2.8)*smoothstep(.99935,.99965,sun)*(1.-clouds*.8);
        col=mix(col,vec3(.018,.09,.12),smoothstep(0.,.18,-d.y));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })); sky.renderOrder = -1000; sky.frustumCulled = false; scene.add(sky);
  // Capture the procedural sky once for roughness-filtered reflections on all gear.
  const reflectionScene = new THREE.Scene(); reflectionScene.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflection = pmrem.fromScene(reflectionScene, .025, .1, 1800, { size: reflectionSize });
  scene.environment = reflection.texture; scene.environmentIntensity = .6;
  pmrem.dispose();
  const islands = createIslands(scene);
  return { update(sim, camera) {
    sky.position.copy(camera.position); skyTime.value = sim.time;
    islands.update(sim);
  } };
}
