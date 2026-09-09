import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, polar, rad } from '../src/physics.js';
function run(seconds, settings = {}, controls = {}, dt = 1 / 120) {
  const sim = new Simulation({ gusts: 0, chop: 0, ...settings });
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt, typeof controls === 'function' ? controls(sim) : controls);
  return sim;
}
const trimmed = sim => ({ trim: sim.telemetry.idealTrim ?? .365 });
test('no wind or rider input cannot create horizontal motion or flight', () => {
  const sim = run(60, { wind: 0 });
  assert.equal(sim.distance, 0); assert.equal(sim.flightTime, 0);
  assert.ok(Math.abs(sim.y - .00706) < .001);
});
test('lift rises before stall and drops after stall', () => {
  assert.ok(polar(12 * rad, 4.6, 1.15, 18 * rad) > polar(5 * rad, 4.6, 1.15, 18 * rad));
  assert.ok(polar(45 * rad, 4.6, 1.15, 18 * rad) < polar(18 * rad, 4.6, 1.15, 18 * rad));
});
test('trimmed beam reach takes off and assisted balance sustains submerged flight', () => {
  const sim = run(60, {}, trimmed);
  assert.ok(sim.telemetry.speed > 5 && sim.telemetry.speed < 16);
  assert.ok(sim.longestFlight > 40); assert.equal(sim.wipeouts, 0);
  assert.ok(sim.telemetry.height > .3 && sim.telemetry.height < .65);
  assert.ok(Math.abs(sim.telemetry.lift - 90 * 9.81) < 10);
});
test('flagging the wing loses speed and returns the board to water', () => {
  const sim = run(25, {}, trimmed), initial = sim.telemetry.speed;
  for (let i = 0; i < 6000; i++) sim.step(1 / 120, { depower: true });
  assert.ok(sim.telemetry.speed < initial * .15);
  assert.ok(sim.telemetry.height < .1);
});
test('light wind cannot magically supply takeoff power', () => {
  const sim = run(60, { wind: 6 }, trimmed);
  assert.equal(sim.flightTime, 0); assert.ok(sim.telemetry.speed < 2);
});
test('larger foil takes off earlier but has more drag', () => {
  const small = run(40, { foil: .12 }, trimmed), large = run(40, { foil: .22 }, trimmed);
  assert.ok(large.flightTime > small.flightTime);
  assert.ok(small.telemetry.speed > large.telemetry.speed);
});
test('unmanaged manual pitch can breach; recovery restores finite state', () => {
  const sim = run(60, { assist: false }, trimmed);
  assert.ok(sim.wipeouts > 0);
  for (const value of [sim.x, sim.y, sim.z, sim.vx, sim.vy, sim.vz, sim.pitch]) assert.ok(Number.isFinite(value));
});
test('pump has a cooldown and limited energy', () => {
  const sim = new Simulation(); assert.equal(sim.pump(), true); assert.equal(sim.pump(), false);
  assert.equal(sim.pumpEnergy, .76);
  for (let n = 0; n < 10; n++) { for (let i = 0; i < 96; i++) sim.step(1 / 120); sim.pump(); }
  assert.ok(sim.pumpEnergy >= 0 && sim.pumpEnergy < .24); assert.equal(sim.pump(), false);
});
test('integration converges across simulation step sizes', () => {
  const a = run(20, {}, trimmed, 1 / 120), b = run(20, {}, trimmed, 1 / 240);
  assert.ok(Math.abs(a.telemetry.speed - b.telemetry.speed) < .03);
  assert.ok(Math.abs(a.distance - b.distance) < .2);
});
test('gusts, turns and opposing weight shifts remain numerically stable', () => {
  const sim = run(180, { gusts: .6, chop: 2, wind: 30 }, s => ({ trim: .5 + Math.sin(s.time * .5) * .45, balance: Math.sin(s.time * .33), steer: Math.sin(s.time * .23) }));
  for (const value of Object.values(sim.telemetry)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  assert.ok(sim.telemetry.speed < 30); assert.ok(Math.abs(sim.y) < 2);
});

test('sheeting in loads a reaching wing, oversheeting stalls it, easing restores drive on either tack', () => {
  for (const heading of [-Math.PI / 2, Math.PI / 2]) {
    const sim = new Simulation({ gusts: 0, chop: 0 }); sim.heading = heading;
    const luff = sim.step(0, { trim: .15 });
    const filled = sim.step(0, { trim: luff.idealTrim });
    const stall = sim.step(0, { trim: .8 });
    const eased = sim.step(0, { trim: filled.idealTrim });
    assert.equal(luff.trimState, 'luffing'); assert.equal(luff.wingLoad, 0);
    assert.equal(filled.trimState, 'sweet'); assert.ok(filled.drive > 150);
    assert.equal(stall.trimState, 'stalled'); assert.equal(stall.status, 'WING STALL');
    assert.ok(stall.drive < filled.drive * .4);
    assert.ok(eased.drive > stall.drive * 2);
    const feathered = sim.step(0, { trim: 0 });
    assert.ok(feathered.drive < eased.drive * .05);
  }
});

test('apparent wind moves the trim target inward as board speed builds', () => {
  const sim = new Simulation({ gusts: 0 });
  const atRest = sim.step(0, { trim: .38 });
  sim.vx = 7;
  const moving = sim.step(0, { trim: .38 });
  assert.ok(moving.beta < atRest.beta);
  assert.ok(moving.idealTrim > atRest.idealTrim + .2);
  assert.equal(moving.trimState, 'luffing');
  assert.equal(sim.step(0, { trim: moving.idealTrim }).trimState, 'sweet');
});

test('efficient trim is unavailable head-to-wind, deep downwind and without airflow', () => {
  for (const heading of [0, Math.PI]) {
    const sim = new Simulation({ gusts: 0 }); sim.heading = heading;
    const t = sim.step(0);
    const trimmed = sim.step(0, { trim: t.idealTrim });
    assert.equal(trimmed.trimAvailable, false); assert.equal(trimmed.trimState, 'heading');
  }
  const sim = new Simulation({ wind: 0 });
  assert.equal(sim.step(0).trimState, 'calm'); assert.equal(sim.telemetry.trimAvailable, false);
});

test('trim is bounded, and flagging overrides every rear-hand position', () => {
  const sim = new Simulation({ gusts: 0 });
  assert.equal(sim.step(0, { trim: -5 }).alpha, sim.step(0, { trim: 0 }).alpha);
  assert.equal(sim.step(0, { trim: 5 }).alpha, sim.step(0, { trim: 1 }).alpha);
  const a = sim.step(0, { trim: 0, depower: true });
  const b = sim.step(0, { trim: 1, depower: true });
  assert.equal(a.drive, b.drive); assert.equal(a.wingLoad, 0); assert.equal(b.trimState, 'flagged');
});

test('powered close reaches retain working trim as apparent wind moves forward on both tacks', () => {
  for (const tack of [-1, 1]) {
    const sim = new Simulation({ gusts: 0, chop: 0 }); sim.heading = tack * 60 * rad;
    for (let i = 0; i < 7200; i++) sim.step(1 / 120, trimmed(sim));
    const t = sim.step(0, trimmed(sim));
    assert.ok(sim.longestFlight > 40);
    assert.ok(t.beta < 30 * rad && t.drive > 200);
    assert.ok(Math.abs(t.alpha / rad - 12) < 1e-8);
    assert.equal(t.trimAvailable, true); assert.equal(t.trimState, 'sweet');
    assert.equal(sim.step(0, { trim: .5 }).trimState, 'luffing');
    assert.equal(sim.step(0, { trim: 1 }).trimState, 'stalled');
  }
});

test('working trim can end at full ease or full sheet without reaching the nominal target', () => {
  for (const tack of [-1, 1]) for (const [heading, trim, alpha] of [[14, 1, 9], [134, 0, 14], [13, 1, 8], [136, 0, 16]]) {
    const sim = new Simulation({ gusts: 0 }); sim.heading = tack * heading * rad;
    const t = sim.step(0, { trim });
    assert.ok(Math.abs(t.alpha / rad - alpha) < 1e-8);
    assert.equal(t.trimAvailable, true, `heading ${heading}`);
    assert.equal(t.trimState, 'sweet', `heading ${heading}`);
    assert.equal(t.idealTrim, trim);
    assert.ok(t.trimMin >= 0 && t.trimMax <= 1 && t.trimMin <= t.trimMax);
    if (trim === 0) assert.equal(t.trimMin, 0);
    else assert.equal(t.trimMax, 1);
  }
  for (const heading of [12.99, 136.01, 0, 180]) {
    const sim = new Simulation({ gusts: 0 }); sim.heading = heading * rad;
    sim.step(0);
    assert.equal(sim.step(0, trimmed(sim)).trimState, 'heading');
    assert.equal(sim.telemetry.trimAvailable, false);
  }
});
