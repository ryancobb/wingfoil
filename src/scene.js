import * as THREE from 'three';
import { createRig } from './graphics/rig.js';
import { createOcean } from './graphics/ocean.js';
import { createWind } from './graphics/wind.js';
import { createEnvironment } from './graphics/environment.js';
import { ellipsoid, rod } from './graphics/primitives.js';
import { surfaceMaterial } from './graphics/materials.js';
import { sampleRenderedWater } from './water.js';
import { createLighting } from './graphics/lighting.js';
import { createFlagAnimation } from './graphics/flag-animation.js';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setClearColor('#a5c9da'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#a5c9da', .00075);
  const camera = new THREE.PerspectiveCamera(49, 1, .1, 2200);
  const lighting = createLighting(scene, renderer);
  const environment = createEnvironment(scene, renderer), ocean = createOcean(scene), rig = createRig(scene), wind = createWind(scene);
  const gateGroup = new THREE.Group(); scene.add(gateGroup);
  const orange = surfaceMaterial('#ff6326'), white = surfaceMaterial('#fff8da');
  const flags = [], buoys = [];
  const flagAnimation = createFlagAnimation();
  for (const x of [-9, 9]) {
    const buoy = new THREE.Group(); buoy.position.x = x; gateGroup.add(buoy); buoys.push(buoy);
    ellipsoid(buoy, orange, [0, .22, 0], [.52, .46, .52]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.4, .1, 8, 20), white); ring.rotation.x = Math.PI / 2; ring.position.set(0, .3, 0); buoy.add(ring);
    rod(buoy, white, [0, .3, 0], [0, 3.1, 0], .025);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.25, .5, 12, 2).translate(.625, 0, 0), surfaceMaterial('#ffb92e', { side: THREE.DoubleSide, roughness: .8 }));
    flag.position.set(0, 2.85, 0); buoy.add(flag); flags.push(flag);
  }
  let mode = 0, initialized = false, previousTime = 0;
  const smoothTarget = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), desiredTarget = new THREE.Vector3();
  const forward = new THREE.Vector3(), right = new THREE.Vector3();
  function resize() { renderer.setSize(container.clientWidth, container.clientHeight); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();
  return {
    camera: () => { mode = (mode + 1) % 3; return ['Chase', 'Side', 'Close'][mode]; },
    inspect: () => ({ rig: rig.inspect(), wind: wind.inspect(), effects: ocean.inspect(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
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
      lighting.update(sim); environment.update(sim, camera); ocean.update(sim, camera.position, dt, renderer.getPixelRatio(), container.clientHeight); wind.update(sim, camera, dt, showWind);
      const flutter = flagAnimation.update(sim.time, sim.telemetry.wind || 0, dt);
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
          flag.rotation.y = -Math.atan2(sim.telemetry.wz || 0, sim.telemetry.wx || 0) + gate.heading;
          const positions = flag.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) { const x = positions.getX(i); positions.setZ(i, Math.sin(x * 9 - flutter.phase) * .1 * x * flutter.strength); }
          positions.needsUpdate = true;
          flag.geometry.computeVertexNormals();
        }
      }
      renderer.render(scene, camera);
    },
  };
}
