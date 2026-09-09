import test from 'node:test';
import assert from 'node:assert/strict';
import { gateNavigation } from '../src/gate-navigation.js';

test('gate compass points ahead, left, right and behind relative to the board', () => {
  const sim = { x: 0, z: 0, heading: 0 };
  for (const [x, z, bearing, direction] of [[0, -100, 0, 'Straight ahead'], [100, 0, Math.PI / 2, 'Turn right'], [-100, 0, -Math.PI / 2, 'Turn left'], [0, 100, -Math.PI, 'Behind you']]) {
    const result = gateNavigation(sim, { x, z });
    assert.ok(Math.abs(Math.atan2(Math.sin(result.bearing - bearing), Math.cos(result.bearing - bearing))) < 1e-10);
    assert.equal(result.distance, 100); assert.equal(result.direction, direction);
  }
});

test('gate direction wraps across north and follows either tack', () => {
  for (const heading of [-Math.PI + .03, -Math.PI / 2, Math.PI / 2, Math.PI - .03]) {
    const sim = { x: 52, z: -18, heading }, bearing = heading + .2;
    const result = gateNavigation(sim, { x: sim.x + Math.sin(bearing) * 75, z: sim.z - Math.cos(bearing) * 75 });
    assert.ok(Math.abs(result.bearing - .2) < 1e-10); assert.ok(Math.abs(result.distance - 75) < 1e-10);
  }
});

test('no gate hides navigation and reaching the midpoint has a finite direction', () => {
  const sim = { x: 12, z: 9, heading: 1.8 };
  assert.equal(gateNavigation(sim, null), null);
  assert.deepEqual(gateNavigation(sim, { x: 12, z: 9 }), { distance: 0, bearing: 0, direction: 'Straight ahead' });
});
