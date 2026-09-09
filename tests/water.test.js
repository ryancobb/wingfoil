import test from 'node:test';
import assert from 'node:assert/strict';
import { wave, sampleWater, sampleRenderedWater } from '../src/water.js';
import { Simulation } from '../src/physics.js';

test('flat water has no displacement, slope or orbital motion at any depth', () => {
  for (const depth of [0, .85, 10]) {
    assert.equal(wave(13, -41, 7, 0), 0);
    for (const value of Object.values(sampleWater(13, -41, 7, 0, depth))) assert.equal(value, 0);
  }
});

test('water slopes and vertical velocity agree with finite differences of the surface', () => {
  const e = 1e-4;
  for (const chop of [.6, 2]) for (let i = 0; i < 30; i++) {
    const x = i * 7.3 - 100, z = 70 - i * 4.1, t = i * .43;
    const water = sampleWater(x, z, t, chop);
    assert.ok(Math.abs(water.height - wave(x, z, t, chop)) < 1e-12);
    const dx = (wave(x + e, z, t, chop) - wave(x - e, z, t, chop)) / (2 * e);
    const dz = (wave(x, z + e, t, chop) - wave(x, z - e, t, chop)) / (2 * e);
    const dt = (wave(x, z, t + e, chop) - wave(x, z, t - e, chop)) / (2 * e);
    assert.ok(Math.abs(water.slopeX - dx) < 1e-7);
    assert.ok(Math.abs(water.slopeZ - dz) < 1e-7);
    assert.ok(Math.abs(water.velocityY - dt) < 1e-7);
    assert.ok(Math.abs(water.vy - water.velocityY) < 1e-12);
  }
});

test('orbital motion weakens with depth while the sampled surface stays fixed', () => {
  const energy = [0, 0, 0];
  for (let i = 0; i < 300; i++) {
    const water = [0, .85, 10].map(depth => sampleWater(12, -5, i * .13, 1, depth));
    for (let d = 0; d < water.length; d++) {
      assert.equal(water[d].height, water[0].height);
      energy[d] += water[d].vx ** 2 + water[d].vy ** 2 + water[d].vz ** 2;
    }
  }
  assert.ok(energy[1] < energy[0] * .7);
  assert.ok(energy[2] < energy[0] * .01);
});

test('an unpowered board floats, pitches and banks with passing swells', () => {
  const sim = new Simulation({ wind: 0, gusts: 0 });
  let minY = Infinity, maxY = -Infinity, pitch = 0, roll = 0, error = 0;
  for (let i = 0; i < 7200; i++) {
    sim.step(1 / 120, { depower: true });
    if (sim.time < 10) continue;
    minY = Math.min(minY, sim.y); maxY = Math.max(maxY, sim.y);
    pitch = Math.max(pitch, Math.abs(sim.pitch)); roll = Math.max(roll, Math.abs(sim.roll));
    error = Math.max(error, Math.abs(sim.telemetry.height));
  }
  assert.ok(maxY - minY > .7);
  assert.ok(pitch > .05 && roll > .08);
  assert.ok(error < .05, 'buoyancy follows moving water without sinking or hovering');
  assert.equal(sim.wipeouts, 0);
});

test('the water face accelerates a wet hull downhill and releases it on takeoff', () => {
  const sim = new Simulation({ wind: 0, gusts: 0, chop: 1 });
  const water = sampleWater(0, 0, 0, 1);
  const downhill = Math.atan2(-water.slopeX, water.slopeZ);
  for (const [heading, sign] of [[downhill, 1], [downhill + Math.PI, -1]]) {
    sim.heading = heading; sim.y = water.height + .015;
    const wet = sim.step(0, { depower: true });
    assert.ok(wet.waveDrive * sign > 20);
    sim.y = water.height + .46;
    const flying = sim.step(0, { depower: true });
    assert.ok(Math.abs(flying.waveDrive) < 1e-12);
    assert.notEqual(flying.foilFlow, 0, 'the submerged foil still experiences water motion');
  }
});

test('default swells allow sustained assisted riding on either tack and a close reach', () => {
  for (const heading of [Math.PI / 2, -Math.PI / 2, Math.PI / 3]) {
    const sim = new Simulation(); sim.heading = heading;
    for (let i = 0; i < 14400; i++) sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38 });
    assert.equal(sim.wipeouts, 0, `heading ${heading}`);
    assert.ok(sim.longestFlight > 10, 'the first-flight course remains attainable');
    assert.ok(sim.flightTime > 100);
    assert.ok(sim.telemetry.speed > 8);
  }
});

test('rough water converges across timesteps and reset starts on the local surface', () => {
  const run = dt => {
    const sim = new Simulation({ chop: 2, gusts: .4 });
    // Compare smooth motion before a discrete breach/recovery transition.
    for (let i = 0; i < Math.round(3 / dt); i++) sim.step(dt, { trim: sim.telemetry.idealTrim ?? .38 });
    return sim;
  };
  const a = run(1 / 120), b = run(1 / 240);
  assert.equal(a.wipeouts, b.wipeouts);
  assert.ok(Math.abs(a.telemetry.speed - b.telemetry.speed) < .06);
  assert.ok(Math.abs(a.y - b.y) < .015);
  assert.ok(Math.abs(a.x - b.x) < .04);
  a.reset();
  assert.equal(a.y, wave(0, 0, 0, 2) + .08);
  assert.equal(a.rollRate, 0); assert.equal(a.pitchRate, 0);
  assert.equal(a.time, 0); assert.equal(a.wipeouts, 0);
});

test('changing wave strength preserves clearance and entry speed without a false wipeout', () => {
  const sim = new Simulation({ chop: 0, gusts: 0 });
  for (let i = 0; i < 3961; i++) sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38 });
  assert.ok(sim.y - wave(sim.x, sim.z, sim.time, 2) > 1.6, 'reproduce the old setting-change wipeout');
  const relativeState = () => {
    const water = sampleWater(sim.x, sim.z, sim.time, sim.settings.chop);
    return { clearance: sim.y - water.height, entry: sim.vy - water.velocityY - water.slopeX * sim.vx - water.slopeZ * sim.vz };
  };
  const before = relativeState();
  const time = sim.time, distance = sim.distance, flight = sim.currentFlight, vx = sim.vx, vz = sim.vz;
  for (const chop of [2, .6, 0, 2]) {
    sim.setChop(chop);
    const after = relativeState();
    assert.ok(Math.abs(after.clearance - before.clearance) < 1e-12);
    assert.ok(Math.abs(after.entry - before.entry) < 1e-12);
    sim.step(0, { trim: sim.telemetry.idealTrim });
    assert.equal(sim.wipeouts, 0); assert.equal(sim.recovery, 0);
    assert.equal(sim.time, time); assert.equal(sim.distance, distance); assert.equal(sim.currentFlight, flight);
    assert.equal(sim.vx, vx); assert.equal(sim.vz, vz);
  }
  sim.step(1 / 120, { trim: sim.telemetry.idealTrim });
  assert.equal(sim.wipeouts, 0);
});

test('floating scenery follows the full, tapered and flat parts of the visible ocean', () => {
  const cx = 134, cz = -72, t = 12.3, chop = 2, e = 1e-4;
  for (const [dx, dz] of [[10, -20], [70, 8], [-78, 20], [3, 84], [15, -88], [96, 28], [-100, 0], [0, 100]]) {
    const x = cx + dx, z = cz + dz;
    const sample = (x, z) => sampleRenderedWater(x, z, t, chop, cx, cz);
    const water = sample(x, z), distance = Math.max(Math.abs(dx), Math.abs(dz));
    if (distance < 65) assert.equal(water.height, wave(x, z, t, chop));
    if (distance > 90) for (const value of Object.values(water)) assert.ok(Math.abs(value) < 1e-12);
    assert.ok(Math.abs(water.slopeX - (sample(x + e, z).height - sample(x - e, z).height) / (2 * e)) < 1e-7);
    assert.ok(Math.abs(water.slopeZ - (sample(x, z + e).height - sample(x, z - e).height) / (2 * e)) < 1e-7);
  }
});
