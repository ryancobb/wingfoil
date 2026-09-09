import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlagAnimation } from '../src/graphics/flag-animation.js';

const phaseDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

test('flag flutter stays bounded through gusts after ten minutes of riding', () => {
  const animation = createFlagAnimation(), dt = 1 / 60;
  let previous = 0;
  for (let i = 1; i <= 60 * 610; i++) {
    const time = i * dt, wind = 9.26 * (1 + .2 * (.65 * Math.sin(time * .39) + .35 * Math.sin(time * 1.17 + .8)));
    const { phase } = animation.update(time, wind, dt), delta = phaseDelta(previous, phase);
    assert.ok(delta >= 3 * dt - 1e-10 && delta <= 8 * dt + 1e-10, `flutter jumped or reversed at ${time}s`);
    assert.ok(phase >= 0 && phase < Math.PI * 2);
    previous = phase;
  }
});

test('wind changes preserve flag phase while paused and reset starts it over', () => {
  const animation = createFlagAnimation();
  const phase = animation.update(300, 8, 1 / 60).phase;
  assert.equal(animation.update(300, 18, 0).phase, phase);
  const next = animation.update(300 + 1 / 60, 18, 1 / 60).phase;
  assert.ok(Math.abs(phaseDelta(phase, next) - 8 / 60) < 1e-10);
  assert.equal(animation.update(0, 8, 0).phase, 0);
});

test('constant wind advances the same flag phase at different frame rates', () => {
  const phases = [30, 60, 120].map(fps => {
    const animation = createFlagAnimation(); let phase;
    for (let i = 1; i <= fps * 10; i++) phase = animation.update(i / fps, 9, 1 / fps).phase;
    return phase;
  });
  for (const phase of phases) assert.ok(Math.abs(phaseDelta(phases[0], phase)) < 1e-10);
});
