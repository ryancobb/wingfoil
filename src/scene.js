import * as THREE from 'three';
import { createRig } from './graphics/rig.js';
import { createOcean } from './graphics/ocean.js';
import { createWind } from './graphics/wind.js';
import { createEnvironment } from './graphics/environment.js';
import { ellipsoid, rod } from './graphics/primitives.js';
import { toon } from './graphics/toon.js';
import { sampleRenderedWater } from './water.js';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setClearColor('#80deef'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#80deef', .00075);
  const camera = new THREE.PerspectiveCamera(49, 1, .1, 2200);
  scene.add(new THREE.HemisphereLight('#c9efff', '#447a96', .85));
  const sun = new THREE.DirectionalLight('#fff3d5', 2.0); sun.position.set(-60, 100, -40); scene.add(sun);
  const environment = createEnvironment(scene), ocean = createOcean(scene), rig = createRig(scene), wind = createWind(scene);
  const gateGroup = new THREE.Group(); scene.add(gateGroup);
  const orange = toon('#ff6326'), white = toon('#fff8da');
  const flags = [], buoys = [];
  for (const x of [-9, 9]) {
    const buoy = new THREE.Group(); buoy.position.x = x; gateGroup.add(buoy); buoys.push(buoy);
    ellipsoid(buoy, orange, [0, .22, 0], [.52, .46, .52]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.4, .1, 8, 20), white); ring.rotation.x = Math.PI / 2; ring.position.set(0, .3, 0); buoy.add(ring);
    rod(buoy, white, [0, .3, 0], [0, 3.1, 0], .025);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.95, .5, 8, 2), toon('#ffb92e', { side: THREE.DoubleSide }));
    flag.position.set(.48, 2.85, 0); buoy.add(flag); flags.push(flag);
  }
  let mode = 0, initialized = false, previousTime = 0;
  const smoothTarget = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), desiredTarget = new THREE.Vector3();
  const forward = new THREE.Vector3(), right = new THREE.Vector3();
  function resize() { renderer.setSize(container.clientWidth, container.clientHeight); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();
  return {
    camera: () => { mode = (mode + 1) % 3; return ['Chase', 'Side', 'Close'][mode]; },
    inspect: () => ({ rig: rig.inspect(), wind: wind.inspect(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      buoys: gateGroup.visible ? buoys.map(buoy => ({ position: buoy.getWorldPosition(new THREE.Vector3()).toArray(), pitch: buoy.rotation.x, roll: buoy.rotation.z })) : [] }),
    render(sim, input, dt, gate, showWind) {
      if (sim.time < previousTime) initialized = false;
      previousTime = sim.time;
      rig.update(sim, input, dt);
      forward.set(Math.sin(sim.heading), 0, -Math.cos(sim.heading)); right.set(Math.cos(sim.heading), 0, Math.sin(sim.heading));
      const shortLandscape = container.clientHeight <= 570 && camera.aspect > 1;
      const compactPortrait = container.clientHeight <= 620 && camera.aspect < 1;
      const back = mode === 2 ? 6.5 : mode === 1 ? 5.5 : shortLandscape ? 7.6 : compactPortrait ? 13.5 : 11.2;
      const side = mode === 1 ? (shortLandscape ? 7 : 10) : mode === 2 ? 2.5 : shortLandscape ? 3.2 : 4.5;
      desiredCamera.copy(rig.root.position).addScaledVector(forward, -back).addScaledVector(right, side);
      desiredCamera.y = sim.y + (mode === 2 ? 2.5 : shortLandscape ? 2.9 : 3.7);
      desiredTarget.copy(rig.root.position).addScaledVector(forward, mode === 2 ? 1.4 : .6);
      desiredTarget.y = sim.y + (compactPortrait ? 1.05 : shortLandscape ? .98 : camera.aspect < 1 ? .85 : .3);
      const ease = initialized ? 1 - Math.exp(-dt * 3) : 1;
      camera.position.lerp(desiredCamera, ease); smoothTarget.lerp(desiredTarget, ease); camera.lookAt(smoothTarget); initialized = true;
      const speedFov = 49 + Math.min(6, (sim.telemetry.speed || 0) * .45);
      camera.fov += (speedFov - camera.fov) * ease; camera.updateProjectionMatrix();
      environment.update(sim, camera); ocean.update(sim, camera.position, dt); wind.update(sim, camera, dt, showWind);
      gateGroup.visible = !!gate;
      if (gate) {
        gateGroup.position.set(gate.x, 0, gate.z); gateGroup.rotation.y = -gate.heading;
        for (const buoy of buoys) {
          const x = gate.x + Math.cos(gate.heading) * buoy.position.x;
          const z = gate.z + Math.sin(gate.heading) * buoy.position.x;
          const water = sampleRenderedWater(x, z, sim.time, sim.settings.chop, sim.x, sim.z);
          buoy.position.y = water.height;
          const sx = water.slopeX * Math.cos(gate.heading) + water.slopeZ * Math.sin(gate.heading);
          const sz = -water.slopeX * Math.sin(gate.heading) + water.slopeZ * Math.cos(gate.heading);
          buoy.rotation.set(-Math.atan(sz) * .6, 0, Math.atan(sx) * .6);
        }
        for (const flag of flags) {
          const positions = flag.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) { const x = positions.getX(i); positions.setZ(i, Math.sin(x * 9 - sim.time * 5) * .09 * (x + .48)); }
          positions.needsUpdate = true;
        }
      }
      renderer.render(scene, camera);
    },
  };
}
