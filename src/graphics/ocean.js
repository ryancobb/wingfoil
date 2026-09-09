import * as THREE from 'three';
import { wave, WATER_GLSL, OCEAN_HALF_SIZE } from '../water.js';

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
    uDeep: { value: new THREE.Color('#0751bd') }, uShallow: { value: new THREE.Color('#079fd4') },
    uSky: { value: new THREE.Color('#80deef') }, uFoam: { value: new THREE.Color('#f2ffdd') },
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
      uniform float uTime,uChop,uWind; uniform vec3 uEye,uRider,uDeep,uShallow,uSky,uFoam; varying vec3 vWorld; varying vec4 vWater;
      void main(){ vec2 p=vWorld.xz; float t=uTime, dist=length(uEye-vWorld);
        vec2 warped=p*.25+vec2(noise(p*.09+t*.025),noise(p*.11-t*.04))*1.1;
        float cells=noise(warped+vec2(0.,-t*.065))*.8+noise(warped*1.9)*.2;
        float rippleScale=clamp(uChop,0.,1.);
        float dx=vWater.y+rippleScale*.016*cos(p.x*1.8+p.y*.8-t*1.7);
        float dz=vWater.z+rippleScale*.014*cos(p.y*1.7+p.x*2.3-t*2.2);
        vec3 n=normalize(vec3(-dx,1.,-dz)), view=normalize(uEye-vWorld);
        float fres=pow(1.-max(dot(n,view),0.),3.);
        float band=smoothstep(.25,.75,cells);
        float face=clamp(.45+vWater.x*.65-dot(vWater.yz,vec2(.6,.8))*1.8,0.,1.);
        vec3 color=mix(uDeep,uShallow,.12+band*.18+face*.55);
        color=mix(color,uSky,fres*.28);
        // Thin, interrupted foam along a crest's forward shoulder. Normalize
        // the crest signal so rough seas don't inflate it into white blankets.
        // Evaluate the narrow ridge per pixel so mesh triangles cannot turn
        // thin caps into straight, angular strips as the surface moves.
        float ridge=renderedWaterSurface(p,t,1.,p-uRider.xz).w;
        float crestAA=max(fwidth(ridge)*1.2,.0015);
        float edge=abs(ridge-(.115+(noise(p*1.3)-.5)*.008));
        float crestLine=(1.-smoothstep(.002,.002+crestAA,edge))*.002/(.002+crestAA*.5);
        float front=smoothstep(-.01,.035,-dot(vWater.yz,vec2(.48,.88)));
        float fragments=smoothstep(.44,.65,noise(p*.85+vec2(-t*.12,t*.06)));
        float nearFade=exp(-dist*.008)*(1.-smoothstep(100.,250.,dist));
        float foam=crestLine*front*fragments*nearFade*clamp(uChop,0.,1.)*.55;
        color=mix(color,uFoam,foam);
        float highlight=pow(max(dot(reflect(normalize(vec3(.45,-1.,-.3)),n),view),0.),180.);
        float glints=smoothstep(.48,.7,noise(p*3.));
        color=mix(color,uFoam,highlight*glints*.15*nearFade);
        // Broad, soft contact shadow anchors the board and wing above the surface.
        vec2 shadowP=(p-uRider.xz-vec2(.1,.2))/vec2(.65,1.15);
        float shadow=exp(-dot(shadowP,shadowP)*1.3)*.2;
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
        float bubbles=smoothstep(.22,.42,noise(vWorld.xz*6.+vec2(time*.2,0.)));
        float alpha=edge*(1.-p.y*p.y)*bubbles*max(0.,1.-vAge)*.9;
        gl_FragColor=vec4(.92,1.,.83,alpha); #include <colorspace_fragment>
      }`.replace('; #include', ';\n #include'),
  });
  const wake = new THREE.Mesh(wakeGeo, wakeMat); wake.frustumCulled = false; wake.renderOrder = 1; scene.add(wake);

  const sprayCount = 100, particles = Array.from({ length: sprayCount }, () => ({ x: 0, y: -20, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
  const sprayPos = new Float32Array(sprayCount * 3), sprayLife = new Float32Array(sprayCount);
  const sprayGeo = new THREE.BufferGeometry(); sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3)); sprayGeo.setAttribute('life', new THREE.BufferAttribute(sprayLife, 1));
  const spray = new THREE.Points(sprayGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `attribute float life; varying float vLife; void main(){vLife=life;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(45./-p.z,1.,9.);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float vLife; void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.91,1.,.96,(1.-smoothstep(.22,.5,r))*vLife*.75);}`,
  })); spray.frustumCulled = false; spray.renderOrder = 3; scene.add(spray);
  let lastSample = -1, cursor = 0, sprayCursor = 0, sprayBudget = 0, previousTime = 0;
  return {
    update(sim, eye, dt) {
      uniforms.uTime.value = sim.time; uniforms.uChop.value = sim.settings.chop; uniforms.uWind.value = sim.telemetry.wind || 0;
      uniforms.uEye.value.copy(eye); uniforms.uRider.value.set(sim.x, sim.y, sim.z);
      near.position.set(sim.x, 0, sim.z); far.position.set(sim.x, 0, sim.z);
      if (sim.time < previousTime) { for (const s of samples) s.born = -100; for (const p of particles) p.life = 0; lastSample = -1; sprayBudget = 0; }
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
      const impact = Math.min(3, sim.telemetry.impact || 0);
      const carve = Math.abs(sim.yawRate) * speed * hull;
      sprayBudget += dt * Math.min(100, speed * (1 + hull * 6) + impact * 45 + carve * 8);
      while (sprayBudget >= 1) {
        sprayBudget--;
        if (speed < 1 && impact < .3) continue;
        const p = particles[sprayCursor++ % sprayCount], side = Math.random() > .5 ? 1 : -1;
        const x = sim.x - dx * .4 - dz * side * .2, z = sim.z - dz * .4 + dx * side * .2;
        const spread = .4 + hull + impact * .7 + carve * .2;
        Object.assign(p, { x, y: wave(x, z, sim.time, sim.settings.chop) + .07, z,
          vx: sim.vx * .3 - dz * side * spread, vz: sim.vz * .3 + dx * side * spread,
          vy: .35 + Math.random() * (.4 + hull * .6 + impact * 1.5), life: 1 });
      }
      for (let i = 0; i < sprayCount; i++) {
        const p = particles[i]; p.life = Math.max(0, p.life - dt * 1.6);
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vy -= dt * 3.5;
        sprayPos.set([p.x, p.y, p.z], i * 3); sprayLife[i] = p.life;
      }
      sprayGeo.attributes.position.needsUpdate = true; sprayGeo.attributes.life.needsUpdate = true;
    },
  };
}
