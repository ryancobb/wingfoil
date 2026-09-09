import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWaterEffects } from '../src/graphics/water-effects.js';
import { Simulation } from '../src/physics.js';

function setup(height = 0) {
  const scene = new THREE.Scene(), effects = createWaterEffects(scene);
  const sim = { x: 0, y: .1, z: 0, vx: 6, vz: 0, heading: Math.PI / 2, yawRate: 0, time: 0, settings: { chop: .6 }, telemetry: { speed: 6, height, impact: 0, wx: 0, wz: 10 } };
  const step = (frames = 1) => { for (let i = 0; i < frames; i++) { sim.time += 1 / 60; sim.x += sim.vx / 60; effects.update(sim, 1 / 60); } };
  return { scene, effects, sim, step };
}

test('wet hull and carving throw more spray than a flying foil', () => {
  const wet = setup(), flying = setup(.46), carving = setup(); carving.sim.yawRate = .7;
  for (const run of [wet, flying, carving]) run.step(20);
  assert.ok(wet.effects.inspect().particles > flying.effects.inspect().particles * 2);
  assert.ok(carving.effects.inspect().particles > wet.effects.inspect().particles);
});

test('a touchdown creates one splash burst and ripples, then its particles expire', () => {
  const { effects, sim, step } = setup(); sim.vx = 0; sim.telemetry.speed = 0; sim.telemetry.impact = 2;
  step();
  assert.equal(effects.inspect().bursts, 1);
  assert.ok(effects.inspect().particles > 40);
  assert.ok(effects.inspect().ripples > 0);
  step(30);
  assert.equal(effects.inspect().bursts, 1, 'a sustained impact must not retrigger bursts every frame');
  sim.telemetry.impact = 0; step(180);
  assert.equal(effects.inspect().particles, 0);
  assert.equal(effects.inspect().ripples, 0);
});

test('the same rough-water contacts produce bursts at 30, 60 and 120 FPS', () => {
  const sim = new Simulation({ chop: 2 }), frames = [];
  // Record one fixed-step trajectory, then replay its telemetry at each render rate.
  for (let i = 0; i < 7200; i++) {
    sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38, balance: sim.time > 20 ? (Math.sin(sim.time * .6) > .3 ? 1 : -1) : 0 });
    frames.push({ ...sim });
  }
  for (const stride of [4, 2, 1]) {
    const effects = createWaterEffects(new THREE.Scene());
    for (let i = stride - 1; i < frames.length; i += stride) effects.update(frames[i], stride / 120);
    assert.equal(effects.inspect().bursts, 2, `both touchdowns should splash at ${120 / stride} FPS`);
  }
});

test('a contact rearms only after impact subsides, including after restart', () => {
  const { effects, sim, step } = setup();
  sim.telemetry.impact = 1; step();
  for (let i = 0; i < 60; i++) { sim.telemetry.impact = i % 2 ? .7 : .6; step(); }
  assert.equal(effects.inspect().bursts, 1, 'threshold noise should not retrigger a sustained contact');
  sim.telemetry.impact = .2; step();
  sim.telemetry.impact = 1; step();
  assert.equal(effects.inspect().bursts, 2);
  sim.time = 0; effects.update(sim, 0);
  assert.equal(effects.inspect().bursts, 0);
  step(); assert.equal(effects.inspect().bursts, 1, 'restart should rearm touchdown detection');
});

test('effects freeze on pause, clear on restart and keep finite, fixed buffers under load', () => {
  const { effects, scene, sim, step } = setup(); step(30);
  const before = effects.inspect();
  const buffers = scene.children.map(mesh => Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, attribute]) => [key, attribute.array])));
  const snapshot = buffers.map(attributes => Object.values(attributes).map(array => Array.from(array)));
  effects.update(sim, 0);
  assert.deepEqual(effects.inspect(), before);
  assert.deepEqual(buffers.map(attributes => Object.values(attributes).map(array => Array.from(array))), snapshot);
  sim.time = 0; effects.update(sim, 0);
  assert.equal(effects.inspect().particles, 0); assert.equal(effects.inspect().ripples, 0);
  for (const mesh of scene.children) assert.ok(mesh.geometry.attributes.alpha.array.every(value => value === 0));
  sim.telemetry.speed = 25; sim.yawRate = 3; sim.telemetry.impact = 4; step(600);
  assert.ok(effects.inspect().particles <= effects.inspect().capacity);
  for (const [i, mesh] of scene.children.entries()) for (const [key, attribute] of Object.entries(mesh.geometry.attributes)) {
    assert.equal(attribute.array, buffers[i][key]);
    assert.ok(attribute.array.every(Number.isFinite));
  }
});
