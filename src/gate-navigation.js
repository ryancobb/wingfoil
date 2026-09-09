import { wrap } from './physics.js';

export function gateNavigation(sim, gate) {
  if (!gate) return null;
  const dx = gate.x - sim.x, dz = gate.z - sim.z, distance = Math.hypot(dx, dz);
  const bearing = distance < .01 ? 0 : wrap(Math.atan2(dx, -dz) - sim.heading);
  const degrees = bearing * 180 / Math.PI;
  const direction = Math.abs(degrees) < 12 ? 'Straight ahead' : Math.abs(degrees) > 160 ? 'Behind you' : degrees > 0 ? 'Turn right' : 'Turn left';
  return { distance, bearing, direction };
}
