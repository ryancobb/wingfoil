import * as THREE from 'three';
import { wave, WATER_GLSL, OCEAN_HALF_SIZE } from '../water.js';
import { SUN_DIRECTION, SUN_COLOR } from './lighting.js';
import { createWaterEffects } from './water-effects.js';

const noiseGLSL = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ return noise(p)*.58+noise(p*2.07+17.)*.28+noise(p*4.11)*.14; }
`;
export function createOcean(scene) {
  const uniforms = {
    uTime: { value: 0 }, uChop: { value: .6 }, uWind: { value: 9 },
    uEye: { value: new THREE.Vector3() }, uRider: { value: new THREE.Vector3() },
    uSun: { value: SUN_DIRECTION }, uSunColor: { value: SUN_COLOR }, uHeading: { value: 0 },
    uWindVector: { value: new THREE.Vector2(0, 9) }, uWindOffset: { value: new THREE.Vector2() },
    uDeep: { value: new THREE.Color('#063b51') }, uShallow: { value: new THREE.Color('#167f86') },
    uSky: { value: new THREE.Color('#a5c9da') }, uFoam: { value: new THREE.Color('#edf4ef') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `${WATER_GLSL}
      uniform float uTime; uniform float uChop; varying vec3 vWorld; varying vec4 vWater;
      void main(){ vec4 w=modelMatrix*vec4(position,1.);
        // Meet the flat distant ring at a common zero-height boundary.
        vWater=renderedWaterSurface(w.xz,uTime,uChop,w.xz-modelMatrix[3].xz);
        w.y=vWater.x;
        vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `${noiseGLSL}
      ${WATER_GLSL}
      uniform float uTime,uChop,uWind,uHeading; uniform vec2 uWindVector,uWindOffset; uniform vec3 uSun,uSunColor,uEye,uRider,uDeep,uShallow,uSky,uFoam; varying vec3 vWorld; varying vec4 vWater;
      void main(){ vec2 p=vWorld.xz; float t=uTime, dist=length(uEye-vWorld);
        vec4 surface=renderedWaterSurface(p,t,uChop,p-uRider.xz);
        vec2 warped=p*.25+vec2(noise(p*.09+t*.025),noise(p*.11-t*.04))*1.1;
        float cells=noise(warped+vec2(0.,-t*.065))*.8+noise(warped*1.9)*.2;
        float rippleScale=clamp(uChop,0.,1.);
        float detailFade=1.-smoothstep(25.,160.,dist);
        float rippleStrength=rippleScale*(.65+min(uWind,18.)*.035)*detailFade;
        vec2 windDir=uWindVector/max(length(uWindVector),.01), crossWind=vec2(-windDir.y,windDir.x);
        vec2 windP=vec2(dot(p-uWindOffset,crossWind),dot(p-uWindOffset,windDir));
        float gust=smoothstep(.42,.72,noise(windP*vec2(.14,.035)))*smoothstep(1.,12.,uWind);
        float catspaw=sin(windP.x*5.5+sin(windP.y*.35))*sin(windP.y*1.8);
        vec2 gustSlope=crossWind*catspaw*gust*.045*detailFade*rippleScale;
        float dx=surface.y+rippleStrength*(.045*cos(p.x*1.8+p.y*.8-t*1.7)+.018*cos(p.x*5.7-p.y*3.1+t*2.8));
        float dz=surface.z+rippleStrength*(.038*cos(p.y*1.7+p.x*2.3-t*2.2)+.016*cos(p.y*6.2+p.x*2.7-t*3.1));
        dx+=gustSlope.x;dz+=gustSlope.y;
        vec3 n=normalize(vec3(-dx,1.,-dz)), view=normalize(uEye-vWorld);
        float fres=pow(1.-max(dot(n,view),0.),3.);
        float band=smoothstep(.25,.75,cells);
        float face=clamp(.45+surface.x*.65-dot(surface.yz,vec2(.6,.8))*1.8,0.,1.);
        vec3 color=mix(uDeep,uShallow,.12+band*.18+face*.55);
        vec3 reflected=reflect(-view,n);
        vec3 reflectedSky=mix(uSky,vec3(.022,.115,.34),pow(max(reflected.y,0.),.55));
        vec2 cloudP=reflected.xz/(max(reflected.y,0.)+.24)*3.4+vec2(t*.004,0.);
        float clouds=smoothstep(.35,.8,noise(cloudP)*.7+noise(cloudP*2.03)*.3)*smoothstep(.025,.12,reflected.y);
        reflectedSky=mix(reflectedSky,vec3(.4,.46,.5),clouds*.14);
        color*=.8+max(dot(n,uSun),0.)*.35;
        color=mix(color,reflectedSky,.08+fres*.62);
        // Transmitted turquoise light on the sun-facing wave shoulders.
        color+=vec3(.015,.19,.13)*max(0.,surface.x+.12)*pow(1.-max(dot(n,view),0.),2.);
        // Thin, interrupted foam along a crest's forward shoulder. Normalize
        // the crest signal so rough seas don't inflate it into white blankets.
        // Evaluate the narrow ridge per pixel so mesh triangles cannot turn
        // thin caps into straight, angular strips as the surface moves.
        float ridge=surface.w/max(uChop,.001);
        float crestAA=max(fwidth(ridge)*1.2,.0015);
        float edge=abs(ridge-(.115+(noise(p*1.3)-.5)*.008));
        float crestLine=(1.-smoothstep(.002,.002+crestAA,edge))*.002/(.002+crestAA*.5);
        float front=smoothstep(-.01,.035,-dot(surface.yz,vec2(.48,.88)));
        float fragments=smoothstep(.44,.65,noise(p*.85+vec2(-t*.12,t*.06)));
        float nearFade=exp(-dist*.008)*(1.-smoothstep(100.,250.,dist));
        float foam=crestLine*front*fragments*nearFade*clamp(uChop,0.,1.)*.55;
        color=mix(color,uFoam,foam);
        color=mix(color,uSky,gust*nearFade*.055);
        float sunAlignment=max(dot(reflect(-uSun,n),view),0.);
        // Footprint filtering widens distant highlights without shimmering pixels.
        float sunWidth=max(fwidth(sunAlignment),.001);
        float highlight=pow(sunAlignment,240./(1.+sunWidth*240.))/(1.+sunWidth*120.);
        float glints=smoothstep(.4,.72,noise(p*3.+t*.1));
        color+=uSunColor*(pow(sunAlignment,22.)*.16+highlight*(.65+glints*1.8));
        vec3 halfLight=normalize(view+uSun);
        float sparkle=pow(max(dot(n,halfLight),0.),600.)*glints*detailFade;
        color+=uSunColor*sparkle*.8;
        // Broad, soft contact shadow anchors the board and wing above the surface.
        vec2 offset=p-uRider.xz+uSun.xz/uSun.y*max(.08,uRider.y);
        vec2 shadowP=vec2(cos(uHeading)*offset.x+sin(uHeading)*offset.y,-sin(uHeading)*offset.x+cos(uHeading)*offset.y)/vec2(.48,1.05);
        float shadow=exp(-dot(shadowP,shadowP)*1.3)*.24;
        vec2 wingShadow=(p-uRider.xz+uSun.xz/uSun.y*(uRider.y+1.9))/vec2(1.45,.8);
        shadow+=exp(-dot(wingShadow,wingShadow))*.1;
        color*=1.-shadow;
        float haze=1.-exp(-dist*.0012);
        color=mix(color,uSky,haze);
        gl_FragColor=vec4(color,mix(.91,1.,smoothstep(8.,45.,dist)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Fine geometry under the rider; the distant ocean needs only a flat ring.
  const near = new THREE.Mesh(new THREE.PlaneGeometry(OCEAN_HALF_SIZE * 2, OCEAN_HALF_SIZE * 2, 160, 160), material); near.rotation.x = -Math.PI / 2; scene.add(near);
  const outerShape = new THREE.Shape(); outerShape.moveTo(-1500, -1500); outerShape.lineTo(1500, -1500); outerShape.lineTo(1500, 1500); outerShape.lineTo(-1500, 1500); outerShape.closePath();
  const r = OCEAN_HALF_SIZE;
  const hole = new THREE.Path(); hole.moveTo(-r, -r); hole.lineTo(-r, r); hole.lineTo(r, r); hole.lineTo(r, -r); hole.closePath(); outerShape.holes.push(hole);
  const far = new THREE.Mesh(new THREE.ShapeGeometry(outerShape), material); far.rotation.x = -Math.PI / 2; scene.add(far);

  const count = 120, samples = Array.from({ length: count }, () => ({ x: 0, z: 0, dx: 0, dz: 0, born: -100, hull: 1, speed: 0 }));
  const wakePositions = new Float32Array(count * 4 * 3), wakeUV = new Float32Array(count * 4 * 2), wakeAge = new Float32Array(count * 4), wakeIndex = [];
  for (let i = 0; i < count; i++) {
    wakeUV.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
    const k = i * 4; wakeIndex.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  const wakeGeo = new THREE.BufferGeometry(); wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePositions, 3)); wakeGeo.setAttribute('uv', new THREE.BufferAttribute(wakeUV, 2)); wakeGeo.setAttribute('age', new THREE.BufferAttribute(wakeAge, 1)); wakeGeo.setIndex(wakeIndex);
  const wakeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: uniforms.uTime },
    vertexShader: `attribute float age; varying vec2 vUv; varying vec3 vWorld; varying float vAge; void main(){vUv=uv;vWorld=position;vAge=age;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${noiseGLSL} uniform float time; varying vec2 vUv; varying vec3 vWorld; varying float vAge;
      void main(){vec2 p=vUv*2.-1.; float edge=1.-smoothstep(.5,1.,abs(p.x));
        float bubbles=smoothstep(.25,.65,noise(vWorld.xz*9.+vec2(time*.2,0.)));
        float filaments=smoothstep(.38,.62,noise(vWorld.xz*3.-time*.12));
        float alpha=edge*(1.-p.y*p.y)*mix(bubbles,filaments,.35)*max(0.,1.-vAge)*.65;
        gl_FragColor=vec4(.8,1.,.96,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wake = new THREE.Mesh(wakeGeo, wakeMat); wake.frustumCulled = false; wake.renderOrder = 1; scene.add(wake);

  const effects = createWaterEffects(scene);
  let lastSample = -1, cursor = 0, previousTime = 0;
  return {
    inspect: effects.inspect,
    update(sim, eye, dt, pixelRatio = 1, viewportHeight = 900) {
      uniforms.uTime.value = sim.time; uniforms.uChop.value = sim.settings.chop; uniforms.uWind.value = sim.telemetry.wind || 0;
      uniforms.uWindVector.value.set(sim.telemetry.wx || 0, sim.telemetry.wz || 0);
      uniforms.uHeading.value = sim.heading;
      uniforms.uEye.value.copy(eye); uniforms.uRider.value.set(sim.x, sim.y, sim.z);
      near.position.set(sim.x, 0, sim.z); far.position.set(sim.x, 0, sim.z);
      if (sim.time < previousTime) { for (const s of samples) s.born = -100; lastSample = -1; uniforms.uWindOffset.value.set(0, 0); }
      uniforms.uWindOffset.value.addScaledVector(uniforms.uWindVector.value, dt * .65);
      previousTime = sim.time;
      const speed = sim.telemetry.speed || 0, dx = Math.sin(sim.heading), dz = -Math.cos(sim.heading), hull = 1 - Math.min(1, Math.max(0, sim.telemetry.height || 0) / .24);
      if (dt > 0 && speed > .7 && sim.time - lastSample > .055) {
        Object.assign(samples[cursor++ % count], { x: sim.x - dx * .7, z: sim.z - dz * .7, dx, dz, born: sim.time, hull, speed }); lastSample = sim.time;
      }
      for (let i = 0; i < count; i++) {
        const s = samples[i], age = sim.time - s.born, width = .12 + s.hull * .3 + age * (.10 + s.hull * .12);
        const length = .12 + s.speed * .055 + age * .12;
        for (let j = 0; j < 4; j++) {
          const side = j % 2 ? 1 : -1, along = j < 2 ? 1 : -1;
          const x = s.x - s.dz * side * width + s.dx * along * length, z = s.z + s.dx * side * width + s.dz * along * length;
          const k = i * 4 + j;
          wakePositions[k * 3] = x; wakePositions[k * 3 + 1] = wave(x, z, sim.time, sim.settings.chop) + .025; wakePositions[k * 3 + 2] = z; wakeAge[k] = age / 5;
        }
      }
      wakeGeo.attributes.position.needsUpdate = true; wakeGeo.attributes.age.needsUpdate = true;
      effects.update(sim, dt, pixelRatio, viewportHeight);
    },
  };
}
