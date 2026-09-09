import * as THREE from 'three';

// Each ribbon is a world-space gust: it travels with the true wind, not the camera.
export function createWind(scene) {
  const count = 24, segments = 36;
  const pos = new Float32Array(count * (segments + 1) * 2 * 3), opacity = new Float32Array(count * (segments + 1) * 2), indices = [];
  const gusts = Array.from({ length: count }, (_, i) => ({ born: -100, seed: i * 13.137, x: 0, z: 0, y: 0, length: 5, radius: .7, curl: i % 3 !== 2 }));
  for (let i = 0; i < count; i++) for (let j = 0; j < segments; j++) {
    const k = (i * (segments + 1) + j) * 2; indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geometry.setAttribute('opacity', new THREE.BufferAttribute(opacity, 1)); geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute float opacity; varying float vOpacity; void main(){vOpacity=opacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float vOpacity; void main(){gl_FragColor=vec4(.88,1.,.91,vOpacity);}`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh);
  const viewDirection = new THREE.Vector3();
  const center = new THREE.Vector3(), next = new THREE.Vector3(), tangent = new THREE.Vector3(), eye = new THREE.Vector3(), side = new THREE.Vector3();
  const rnd = (seed, n) => { const v = Math.sin(seed * 17.91 + n * 43.71) * 43658.21; return v - Math.floor(v); };
  let previousTime = 0;
  function path(g, u, dx, dz, output) {
    let along = u * g.length, across = Math.sin(u * Math.PI * 1.4) * .20, rise = Math.sin(u * Math.PI) * .16;
    if (g.curl && u > .58) {
      const theta = (u - .58) / .42 * Math.PI * 1.8;
      along = .58 * g.length + Math.sin(theta) * g.radius;
      rise += (1 - Math.cos(theta)) * g.radius;
    }
    output.set(g.x + dx * along - dz * across, g.y + rise, g.z + dz * along + dx * across);
  }
  return {
    update(sim, camera, dt, visible) {
      const wind = sim.telemetry.wind || 0;
      mesh.visible = visible && wind > .3;
      const dx = (sim.telemetry.wx || 0) / Math.max(.01, wind), dz = (sim.telemetry.wz || 0) / Math.max(.01, wind);
      if (sim.time < previousTime) for (const g of gusts) g.born = -100;
      previousTime = sim.time;
      for (let i = 0; i < count; i++) {
        const g = gusts[i];
        if (g.born < -50 || sim.time - g.born > 4.5) {
          g.seed += 1;
          camera.getWorldDirection(viewDirection); viewDirection.y = 0; viewDirection.normalize();
          const depth = i < 16 ? 5 + rnd(g.seed, 2) * 18 : 24 + rnd(g.seed, 2) * 25;
          const lateral = (rnd(g.seed, 1) - .5) * depth * camera.aspect * .8;
          Object.assign(g, { born: sim.time - (g.born < -50 ? rnd(g.seed, 8) * 4.3 : 0), x: camera.position.x + viewDirection.x * depth - viewDirection.z * lateral, z: camera.position.z + viewDirection.z * depth + viewDirection.x * lateral, y: .45 + rnd(g.seed, 3) * 3.6, radius: .48 + rnd(g.seed, 5) * .65, length: 3.6 + Math.min(12, wind) * .23 + rnd(g.seed, 6) * 2 });
        }
        g.x += dx * wind * dt; g.z += dz * wind * dt;
        const age = (sim.time - g.born) / 4.5;
        const envelope = Math.sin(Math.min(1, Math.max(0, age)) * Math.PI);
        for (let j = 0; j <= segments; j++) {
          const u = j / segments;
          path(g, u, dx, dz, center); path(g, Math.min(1, u + .002), dx, dz, next);
          if (j === segments) { path(g, u - .002, dx, dz, next); tangent.subVectors(center, next); } else tangent.subVectors(next, center);
          eye.subVectors(camera.position, center); side.crossVectors(tangent, eye).normalize();
          const taper = Math.pow(Math.sin(u * Math.PI), .65), width = (.027 + Math.min(wind, 15) * .0022) * taper;
          const riderDistance = Math.hypot(center.x - sim.x, center.z - sim.z);
          const clearRider = Math.min(1, Math.max(0, (riderDistance - 1.5) / 2));
          const alpha = envelope * taper * (.42 + Math.min(wind / 25, .25)) * clearRider;
          for (let k = 0; k < 2; k++) {
            const index = (i * (segments + 1) + j) * 2 + k, sign = k ? 1 : -1;
            pos[index * 3] = center.x + side.x * width * sign;
            pos[index * 3 + 1] = center.y + side.y * width * sign;
            pos[index * 3 + 2] = center.z + side.z * width * sign;
            opacity[index] = alpha;
          }
        }
      }
      geometry.attributes.position.needsUpdate = true; geometry.attributes.opacity.needsUpdate = true;
    },
    inspect: () => ({ visible: mesh.visible, ribbons: count }),
  };
}
