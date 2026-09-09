import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, wrap } from '../src/physics.js';
import { wingPose, smoothAngle } from '../src/graphics/wing-pose.js';
import { solveJoint } from '../src/graphics/primitives.js';
import { Scene, Vector3 } from 'three';
import { createRig } from '../src/graphics/rig.js';

function setup(heading, speed = 0) {
  const sim = new Simulation({ gusts: 0, chop: 0 }); sim.heading = heading;
  sim.vx = Math.sin(heading) * speed; sim.vz = -Math.cos(heading) * speed; return sim;
}
test('rendered sheeting angle matches the force model on both tacks', () => {
  for (const heading of [-2.4, -Math.PI / 2, -.6, .6, Math.PI / 2, 2.4]) for (const trim of [.1, .38, .65, .9]) {
    const sim = setup(heading, 6), input = { trim, depower: false }; sim.step(0, input);
    const pose = wingPose(sim, input);
    assert.ok(Math.abs(pose.alpha - sim.telemetry.alpha) < 1e-10);
    assert.ok(Math.abs(Math.abs(pose.yaw) - pose.sheet) < 1e-10);
  }
});
test('opposite tacks mirror wing heading and bank', () => {
  const a = setup(Math.PI / 2, 5), b = setup(-Math.PI / 2, 5), input = { trim: .65 };
  a.step(0, input); b.step(0, input);
  const pa = wingPose(a, input), pb = wingPose(b, input);
  assert.equal(pa.tack, -pb.tack); assert.equal(pa.yaw, -pb.yaw); assert.equal(pa.bank, -pb.bank);
});
test('flagged wing chord streams with apparent wind independently of trim', () => {
  for (const heading of [-2.4, -1, .5, 1.5, 2.6]) {
    const sim = setup(heading, 7); sim.step(0, { trim: .5 });
    const a = wingPose(sim, { trim: .1, depower: true }), b = wingPose(sim, { trim: .9, depower: true });
    assert.equal(a.yaw, b.yaw);
    assert.ok(Math.abs(Math.sin(a.yaw) - a.flow.x / a.apparent) < 1e-10);
    assert.ok(Math.abs(Math.cos(a.yaw) - a.flow.z / a.apparent) < 1e-10);
  }
});
test('tack hysteresis avoids fluttering between sides near head-to-wind', () => {
  for (const heading of [-.01, .01]) {
    const sim = setup(heading, 0); sim.step(0, { trim: .5 });
    assert.equal(wingPose(sim, { trim: .5 }, -1).tack, -1);
    assert.equal(wingPose(sim, { trim: .5 }, 1).tack, 1);
  }
});
test('wing heading interpolation crosses the angle seam by the short path', () => {
  const a = Math.PI - .02, b = -Math.PI + .02;
  assert.ok(Math.abs(wrap(smoothAngle(a, b, .5) - Math.PI)) < 1e-10);
});
test('limb joints preserve upper and lower lengths for reachable grips', () => {
  const a = new Vector3(0, 1.4, 0), b = new Vector3(.4, 1.8, -.2), pole = new Vector3(.3, 1.1, -.4), joint = new Vector3();
  solveJoint(a, b, pole, .38, .36, joint);
  assert.ok(Math.abs(a.distanceTo(joint) - .38) < 1e-10);
  assert.ok(Math.abs(b.distanceTo(joint) - .36) < 1e-10);
});

test('joint solver stays finite for coincident targets and collinear bend poles', () => {
  const root = new Vector3(), joint = new Vector3();
  solveJoint(root, root, root, .38, .36, joint);
  assert.ok(joint.toArray().every(Number.isFinite));
  assert.ok(joint.length() <= .381);
  const end = new Vector3(0, .5, 0);
  solveJoint(root, end, end, .38, .36, joint);
  assert.ok(Math.abs(root.distanceTo(joint) - .38) < 1e-10);
  assert.ok(Math.abs(end.distanceTo(joint) - .36) < 1e-10);
});

test('hands stay within reach through bank, pitch, trim, wing sizes and grip changes', () => {
  const rig = createRig(new Scene()), sim = new Simulation();
  sim.telemetry = { wx: 0, wz: 9, wingLoad: 400 };
  for (const wing of [4, 5, 6]) for (const heading of [-Math.PI / 2, Math.PI / 2])
  for (const trim of [0, .38, .65, 1]) for (const depower of [false, true])
  for (const roll of [-.48, 0, .48]) for (const pitch of [-.15, .15]) {
    Object.assign(sim, { heading, roll, pitch }); sim.settings.wing = wing;
    for (let frame = 0; frame < 24; frame++) {
      rig.update(sim, { trim, depower, balance: 0 }, 1 / 60);
      assert.ok(rig.inspect().armReachError < .005, JSON.stringify({ wing, heading, trim, depower, roll, pitch, frame }));
    }
  }
});
