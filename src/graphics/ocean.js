import * as THREE from 'three';
import { wave } from '../physics.js';

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
    uDeep: { value: new THREE.Color('#056788') }, uShallow: { value: new THREE.Color('#10a4aa') },
    uSky: { value: new THREE.Color('#80c8dc') }, uFoam: { value: new THREE.Color('#def5e7') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; uniform float uChop; varying vec3 vWorld;
      void main(){ vec4 w=modelMatrix*vec4(position,1.);
        w.y=uChop*(.045*sin(w.x*.19+w.z*.11-uTime*1.3)+.025*sin(w.z*.43-uTime*1.8));
        vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `${noiseGLSL}
      uniform float uTime,uChop,uWind; uniform vec3 uEye,uRider,uDeep,uShallow,uSky,uFoam; varying vec3 vWorld;
      void main(){ vec2 p=vWorld.xz; float t=uTime, dist=length(uEye-vWorld);
        vec2 warped=p*.38+vec2(noise(p*.11+t*.025),noise(p*.13-t*.04))*1.5;
        float cells=fbm(warped+vec2(0.,-t*.065));
        float broad=sin(p.x*.19+p.y*.11-t*1.3);
        float ripple=sin(p.x*2.3+p.y*1.7-t*2.2);
        float dx=uChop*(.00855*cos(p.x*.19+p.y*.11-t*1.3))+.025*cos(p.x*1.8+p.y*.8-t*1.7);
        float dz=uChop*(.00495*cos(p.x*.19+p.y*.11-t*1.3)+.01075*cos(p.y*.43-t*1.8))+.023*cos(p.y*1.7+p.x*2.3-t*2.2);
        vec3 n=normalize(vec3(-dx,1.,-dz)), view=normalize(uEye-vWorld);
        float fres=pow(1.-max(dot(n,view),0.),3.);
        vec3 color=mix(uDeep,uShallow,smoothstep(.16,.82,cells)*.65+max(broad,0.)*.09);
        color=mix(color,uSky,fres*.40);
        // Broken, antialiased contour lines suggest hand-painted foam, not a repeating grid.
        float contour=abs(cells-.51), aa=max(fwidth(cells)*1.2,.003);
        float lace=1.-smoothstep(.009,.009+aa,contour);
        float foamPatch=smoothstep(.48,.72,noise(p*.055+vec2(t*.013,0.)));
        float nearFade=exp(-dist*.013)*(1.-smoothstep(90.,230.,dist));
        float whitecap=smoothstep(.93,.985,sin(p.x*.22+p.y*.35-t*1.6+cells*3.)) * smoothstep(.57,.75,cells);
        float foam=(lace*foamPatch*.42+whitecap*.6)*nearFade*clamp(uWind/7.,0.,1.);
        color=mix(color,uFoam,clamp(foam,0.,.78));
        float highlight=pow(max(dot(reflect(normalize(vec3(.45,-1.,-.3)),n),view),0.),95.);
        color+=vec3(1.,.88,.60)*highlight*.6;
        // Broad, soft contact shadow anchors the board and wing above the surface.
        vec2 shadowP=(p-uRider.xz-vec2(.1,.2))/vec2(.65,1.15);
        float shadow=exp(-dot(shadowP,shadowP)*1.3)*.2;
        color*=1.-shadow;
        float haze=1.-exp(-dist*.002);
        color=mix(color,uSky,haze);
        gl_FragColor=vec4(color,mix(.91,1.,smoothstep(8.,45.,dist)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Fine geometry under the rider; the distant ocean needs only a flat ring.
  const near = new THREE.Mesh(new THREE.PlaneGeometry(180, 180, 160, 160), material); near.rotation.x = -Math.PI / 2; scene.add(near);
  const outerShape = new THREE.Shape(); outerShape.moveTo(-1500, -1500); outerShape.lineTo(1500, -1500); outerShape.lineTo(1500, 1500); outerShape.lineTo(-1500, 1500); outerShape.closePath();
  const hole = new THREE.Path(); hole.moveTo(-90, -90); hole.lineTo(-90, 90); hole.lineTo(90, 90); hole.lineTo(90, -90); hole.closePath(); outerShape.holes.push(hole);
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
        float bubbles=smoothstep(.32,.72,noise(vWorld.xz*8.+vec2(time*.2,0.)));
        float alpha=edge*(1.-p.y*p.y)*bubbles*max(0.,1.-vAge)*.6;
        gl_FragColor=vec4(.83,.98,.89,alpha); #include <colorspace_fragment>
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
      if (sim.time < previousTime) { for (const s of samples) s.born = -100; for (const p of particles) p.life = 0; lastSample = -1; }
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
      sprayBudget += dt * Math.min(60, speed * (4 + hull * 3));
      while (sprayBudget >= 1) {
        sprayBudget--;
        if (speed < 1) continue;
        const p = particles[sprayCursor++ % sprayCount], side = Math.random() > .5 ? 1 : -1;
        Object.assign(p, { x: sim.x - dx * .4 - dz * side * .2, y: wave(sim.x, sim.z, sim.time, sim.settings.chop) + .07, z: sim.z - dz * .4 + dx * side * .2,
          vx: sim.vx * .3 - dz * side * (.4 + hull), vz: sim.vz * .3 + dx * side * (.4 + hull), vy: .35 + Math.random() * (.4 + hull * .6), life: 1 });
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
