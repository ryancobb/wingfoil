import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/physics.js';
import { trimFeedback } from '../src/trim-feedback.js';

test('trim advice follows airflow and never rewards a clamped but unreachable target', () => {
  const sim = new Simulation({ gusts: 0 });
  assert.match(trimFeedback(sim.step(0, { trim: .1 })).label, /Sheet in/);
  assert.match(trimFeedback(sim.step(0, { trim: 1 })).label, /Ease out/);
  assert.equal(trimFeedback(sim.step(0, { trim: .38 })).good, true);
  for (const heading of [0, Math.PI]) {
    sim.heading = heading;
    sim.step(0);
    const feedback = trimFeedback(sim.step(0, { trim: sim.telemetry.idealTrim }));
    assert.match(feedback.label, /Steer/); assert.equal(feedback.good, false); assert.equal(feedback.showTarget, false);
  }
  const flagged = trimFeedback(sim.step(0, { depower: true }));
  assert.match(flagged.hint, /Power up/); assert.equal(flagged.showTarget, false);
});

test('valid close reaches and endpoint trim keep airflow advice and the green band', () => {
  const sim = new Simulation({ gusts: 0, chop: 0 });
  sim.heading = Math.PI / 3;
  for (let i = 0; i < 7200; i++) sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38 });
  let feedback = trimFeedback(sim.step(0, { trim: sim.telemetry.idealTrim }));
  assert.equal(feedback.good, true); assert.equal(feedback.showTarget, true);
  assert.match(trimFeedback(sim.step(0, { trim: .5 })).label, /Sheet in/);
  assert.match(trimFeedback(sim.step(0, { trim: 1 })).label, /Ease out/);
  sim.reset(); sim.heading = 134 * Math.PI / 180;
  feedback = trimFeedback(sim.step(0, { trim: 0 }));
  assert.equal(feedback.good, true); assert.equal(feedback.showTarget, true);
  assert.match(trimFeedback(sim.step(0, { trim: .1 })).label, /Ease out/);
  assert.equal(trimFeedback(sim.step(0, { trim: 0, depower: true })).showTarget, false);
  sim.heading = 0;
  assert.match(trimFeedback(sim.step(0)).hint, /Turn away/);
  sim.heading = Math.PI;
  assert.match(trimFeedback(sim.step(0)).hint, /Turn across/);
});
