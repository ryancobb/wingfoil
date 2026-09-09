import * as THREE from 'three';
import { wave, WATER_GLSL } from '../water.js';

const PARTICLES = 640, RIPPLES = 32;

// Spray, mist and splash rings reuse their buffers throughout a session.
export function createWaterEffects(scene) {
  const particles = Array.from({ length: PARTICLES }, () => ({ life: 0 }));
  const positions = new Float32Array(PARTICLES * 3), sizes = new Float32Array(PARTICLES), alpha = new Float32Array(PARTICLES), kinds = new Float32Array(PARTICLES);
  const geometry = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position', positions, 3], ['size', sizes, 1], ['alpha', alpha, 1], ['kind', kinds, 1]]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
  }
  const scale = { value: 900 };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: scale },
    vertexShader: `attribute float size,alpha,kind; uniform float uScale; varying float vAlpha,vKind;
      void main(){vAlpha=alpha;vKind=kind;vec4 p=modelViewMatrix*vec4(position,1.);
        gl_PointSize=clamp(size*uScale/max(.1,-p.z),1.,64.);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float vAlpha,vKind;
      void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.||vAlpha<.001)discard;
        float soft=mix(1.-smoothstep(.15,1.,r),exp(-r*3.)*(1.-smoothstep(.5,1.,r)),vKind);
        float glint=pow(max(0.,1.-length(p-vec2(-.25,.3))),6.)*(1.-vKind);
        vec3 color=mix(vec3(.55,.88,1.),vec3(1.5,1.45,1.2),glint+.25);
        gl_FragColor=vec4(color,vAlpha*soft);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const spray = new THREE.Points(geometry, material); spray.frustumCulled = false; spray.renderOrder = 3; scene.add(spray);

  const rings = Array.from({ length: RIPPLES }, () => ({ life: 0 }));
  const ringPositions = new Float32Array(RIPPLES * 12), ringUV = new Float32Array(RIPPLES * 8), ringAlpha = new Float32Array(RIPPLES * 4), indices = [];
  for (let i = 0; i < RIPPLES; i++) {
    ringUV.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
    const k = i * 4; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const ringGeometry = new THREE.BufferGeometry();
  ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3).setUsage(THREE.DynamicDrawUsage));
  ringGeometry.setAttribute('uv', new THREE.BufferAttribute(ringUV, 2));
  ringGeometry.setAttribute('alpha', new THREE.BufferAttribute(ringAlpha, 1).setUsage(THREE.DynamicDrawUsage)); ringGeometry.setIndex(indices);
  const time = { value: 0 }, chop = { value: .6 }, rider = { value: new THREE.Vector2() };
  const ripples = new THREE.Mesh(ringGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: time, uChop: chop, uRider: rider },
    vertexShader: `${WATER_GLSL} uniform float uTime,uChop;uniform vec2 uRider;attribute float alpha;varying vec2 vUv;varying float vAlpha;
      void main(){vUv=uv;vAlpha=alpha;vec3 p=position;p.y=renderedWaterSurface(p.xz,uTime,uChop,p.xz-uRider).x+.035;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vAlpha;
      void main(){vec2 p=vUv*2.-1.;float r=length(p);float aa=max(fwidth(r),.012);
        float ring=1.-smoothstep(.025,.025+aa,abs(r-.78));
        float broken=.65+.35*sin(atan(p.y,p.x)*13.+r*24.);
        gl_FragColor=vec4(.67,.94,1.,ring*broken*vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })); ripples.frustumCulled = false; ripples.renderOrder = 2; scene.add(ripples);

  let cursor = 0, ringCursor = 0, budget = 0, previousTime = 0, impactArmed = true, burstCooldown = 0, bursts = 0, seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function ripple(x, z, strength) {
    Object.assign(rings[ringCursor++ % RIPPLES], { x, z, strength, life: 1, radius: .12 });
  }
  function emit(sim, hull, strength, burst = false) {
    const p = particles[cursor++ % PARTICLES], dx = Math.sin(sim.heading), dz = -Math.cos(sim.heading);
    const side = random() < .5 ? -1 : 1, angle = random() * Math.PI * 2;
    const carve = Math.min(2, Math.abs(sim.yawRate || 0) * (sim.telemetry.speed || 0));
    const spread = (.5 + hull * 1.6 + strength * 1.3 + carve) * (.5 + random());
    const mist = random() < .22;
    const x = sim.x - dx * .65 - dz * side * .27, z = sim.z - dz * .65 + dx * side * .27;
    const duration = mist ? 1.1 + random() * .7 : .4 + random() * .55;
    Object.assign(p, { x, z, y: wave(x, z, sim.time, sim.settings.chop) + .09,
      vx: sim.vx * .25 + (burst ? Math.cos(angle) : -dz * side) * spread,
      vz: sim.vz * .25 + (burst ? Math.sin(angle) : dx * side) * spread,
      vy: .55 + random() * (.9 + strength * 1.4), duration, life: duration, mist,
      size: mist ? .18 + random() * .22 : .025 + random() * .05 });
  }
  return {
    inspect: () => ({ particles: particles.filter(p => p.life > 0).length, ripples: rings.filter(r => r.life > 0).length, capacity: PARTICLES, bursts }),
    update(sim, dt, pixelRatio = 1, viewportHeight = 900) {
      time.value = sim.time; chop.value = sim.settings.chop; rider.value.set(sim.x, sim.z);
      scale.value = viewportHeight * pixelRatio;
      if (sim.time < previousTime) {
        for (const p of particles) p.life = 0;
        for (const r of rings) r.life = 0;
        alpha.fill(0); ringAlpha.fill(0); budget = 0; impactArmed = true; burstCooldown = 0; bursts = 0;
        geometry.attributes.alpha.needsUpdate = true; ringGeometry.attributes.alpha.needsUpdate = true;
      }
      previousTime = sim.time;
      if (dt <= 0) return;
      dt = Math.min(dt, .05);
      const speed = sim.telemetry.speed || 0, impact = Math.min(4, sim.telemetry.impact || 0);
      const hull = 1 - THREE.MathUtils.clamp((sim.telemetry.height || 0) / .24, 0, 1);
      const carve = Math.min(3, Math.abs(sim.yawRate || 0) * speed);
      burstCooldown = Math.max(0, burstCooldown - dt);
      // Detect a contact's strength, not its change per rendered frame. Hysteresis
      // prevents small fluctuations around the threshold from repeating a splash.
      if (impact < .3) impactArmed = true;
      if (impact > .65 && impactArmed && burstCooldown === 0) {
        for (let i = 0; i < 45 + impact * 22; i++) emit(sim, hull, impact, true);
        ripple(sim.x, sim.z, Math.min(1, impact / 2)); bursts++; burstCooldown = .22; impactArmed = false;
      }
      if (speed > .7) {
        budget += dt * Math.min(280, speed * (5 + hull * 19) + carve * 25);
        while (budget >= 1) { emit(sim, hull, impact * .5); budget--; }
      } else budget = 0;
      for (let i = 0; i < PARTICLES; i++) {
        const p = particles[i]; alpha[i] = 0;
        if (p.life <= 0) continue;
        p.life -= dt;
        const drag = Math.exp(-dt * (p.mist ? 2.1 : .6));
        p.vx *= drag; p.vz *= drag;
        if (p.mist) { p.vx += (sim.telemetry.wx || 0) * dt * .45; p.vz += (sim.telemetry.wz || 0) * dt * .45; }
        p.vy -= dt * (p.mist ? 1.2 : 7.5);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < wave(p.x, p.z, sim.time, sim.settings.chop) + .015) {
          if (!p.mist && p.size > .06) ripple(p.x, p.z, .22);
          p.life = 0; continue;
        }
        const life = Math.max(0, p.life / p.duration);
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        sizes[i] = p.size * (p.mist ? 1 + (1 - life) * 2.5 : 1);
        alpha[i] = Math.min(1, (1 - life) * 12) * Math.pow(life, .7) * (p.mist ? .2 : .9);
        kinds[i] = p.mist ? 1 : 0;
      }
      for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
      for (let i = 0; i < RIPPLES; i++) {
        const r = rings[i]; r.life = Math.max(0, r.life - dt * .85);
        if (r.life > 0) r.radius += dt * (.65 + r.strength * 1.4);
        for (let j = 0; j < 4; j++) {
          const k = i * 4 + j;
          ringAlpha[k] = r.life * (r.strength || 0) * .45;
          ringPositions[k * 3] = (r.x || 0) + (j % 2 ? 1 : -1) * (r.radius || 0);
          ringPositions[k * 3 + 2] = (r.z || 0) + (j < 2 ? -1 : 1) * (r.radius || 0);
        }
      }
      ringGeometry.attributes.position.needsUpdate = true; ringGeometry.attributes.alpha.needsUpdate = true;
    },
  };
}
