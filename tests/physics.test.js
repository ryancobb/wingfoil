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
