import { clamp, rad, wrap, sheetAngle } from '../physics.js';

// Return board-local heading. Local +z runs from leading edge to trailing edge.
export function wingPose(sim, input, previousTack = -1) {
  const ax = (sim.telemetry.wx || 0) - sim.vx, az = (sim.telemetry.wz || 0) - sim.vz;
  const across = ax * Math.cos(sim.heading) + az * Math.sin(sim.heading);
  const aft = -ax * Math.sin(sim.heading) + az * Math.cos(sim.heading);
  const apparent = Math.hypot(across, aft);
  const sourceSide = -across / Math.max(.01, apparent);
  const tack = Math.abs(sourceSide) > .13 ? Math.sign(sourceSide) : previousTack;
  const sheet = sheetAngle(input.trim);
  return {
    tack,
    yaw: input.depower ? Math.atan2(across, aft) : -tack * sheet,
    bank: input.depower ? tack * .08 : tack * 54 * rad,
    sheet,
    apparent,
    // Positive angle is loaded, negative is luffing; exactly the simulation's angle.
    alpha: Math.acos(clamp(aft / Math.max(.01, apparent), -1, 1)) - sheet,
    flow: { x: across, z: aft },
  };
}

export function smoothAngle(current, target, amount) { return current + wrap(target - current) * amount; }
