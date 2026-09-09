import { wave, sampleWater } from './water.js';
export { wave, WAVE_COMPONENTS } from './water.js';

// SI units; horizontal coordinates x/z, heading zero points north (-z).
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rad = Math.PI / 180;
export const KNOTS = 1.94384;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// Trim is rear-hand sheeting, not a throttle: in closes the chord to the board,
// increasing incidence until the wing stalls. Keep rendering and guidance in sync.
export const sheetAngle = (trim = .38) => (5 + (1 - clamp(trim, 0, 1)) * 115) * rad;
export function wingTrim(beta, trim, apparent, depower = false) {
  const alpha = beta - sheetAngle(trim);
  const target = 1 - (beta / rad - 17) / 115; // 12° working incidence
  const idealTrim = clamp(target, 0, 1);
  // Intersect the 8–16° working band with the rear hand's actual travel.
  // A forward apparent wind can still power a close reach, and an endpoint
  // can provide working incidence even when the exact 12° target is beyond it.
  const minWorking = 8 * rad, maxWorking = 16 * rad, tolerance = 1e-10;
  const minAlpha = beta - sheetAngle(0), maxAlpha = beta - sheetAngle(1);
  const trimAvailable = apparent >= .5 && maxAlpha >= minWorking - tolerance && minAlpha <= maxWorking + tolerance;
  const trimMin = clamp(target - 4 / 115, 0, 1), trimMax = clamp(target + 4 / 115, 0, 1);
  const trimState = depower ? 'flagged' : apparent < .5 ? 'calm' : !trimAvailable ? 'heading'
    : alpha < 2 * rad ? 'luffing' : alpha > 18 * rad ? 'stalled'
    : alpha < minWorking - tolerance ? 'under' : alpha > maxWorking + tolerance ? 'over' : 'sweet';
  return { alpha, idealTrim, trimMin, trimMax, trimAvailable, trimState };
}
export function polar(alpha, slope, maxCl, stall) {
  const a = Math.abs(alpha), sign = Math.sign(alpha);
  return sign * (a <= stall ? Math.min(slope * a, maxCl) : maxCl * Math.exp(-(a - stall) * 4.5));
}
export class Simulation {
  constructor(options = {}) {
    this.settings = { wind: 18, gusts: .2, chop: .6, wing: 5, foil: .18, assist: true, ...options };
    this.reset();
  }
  reset() {
    Object.assign(this, { x: 0, z: 0, y: wave(0, 0, 0, this.settings.chop) + .08, vx: 0, vz: 0, vy: 0, heading: Math.PI / 2, pitch: 0, pitchRate: 0, roll: 0, rollRate: 0, yawRate: 0, time: 0, distance: 0, flightTime: 0, longestFlight: 0, currentFlight: 0, topSpeed: 0, wipeouts: 0, recovery: 0, breachTime: 0, pumpEnergy: 1, pumpPhase: 0, pumpCooldown: 0, telemetry: {} });
  }
  setChop(chop) {
    const before = sampleWater(this.x, this.z, this.time, this.settings.chop);
    const after = sampleWater(this.x, this.z, this.time, chop);
    // Changing conditions moves the water beneath the rider. Preserve both
    // clearance and entry speed along the board's current horizontal path.
    this.y += after.height - before.height;
    this.vy += after.velocityY - before.velocityY
      + (after.slopeX - before.slopeX) * this.vx + (after.slopeZ - before.slopeZ) * this.vz;
    this.settings.chop = chop;
  }
  pump() {
    if (this.pumpEnergy < .24 || this.pumpCooldown > 0 || this.recovery > 0) return false;
    this.pumpEnergy -= .24; this.pumpPhase = .65; this.pumpCooldown = .75; return true;
  }
  step(dt, input = {}) {
    const { steer = 0, balance = 0, trim = .38, depower = false } = input;
    const s = this.settings;
    this.time += dt;
    this.pumpEnergy = Math.min(1, this.pumpEnergy + dt * .09);
    this.pumpCooldown = Math.max(0, this.pumpCooldown - dt);
    this.pumpPhase = Math.max(0, this.pumpPhase - dt);
    const gust = 1 + s.gusts * (.65 * Math.sin(this.time * .39 + this.x * .012) + .35 * Math.sin(this.time * 1.17 + .8));
    const wind = s.wind / KNOTS * gust;
    const windDirection = .065 * Math.sin(this.time * .12) * s.gusts;
    const wx = Math.sin(windDirection) * wind, wz = Math.cos(windDirection) * wind;
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading), rx = Math.cos(this.heading), rz = Math.sin(this.heading);
    const forward = this.vx * fx + this.vz * fz, sideways = this.vx * rx + this.vz * rz;
    const speed = Math.hypot(this.vx, this.vz);
    const ax = wx - this.vx, az = wz - this.vz, apparent = Math.hypot(ax, az);
    const beta = Math.acos(clamp(-(ax * fx + az * fz) / Math.max(.01, apparent), -1, 1));
    const trimming = wingTrim(beta, trim, apparent, depower);
    const { alpha } = trimming;
    const wingCl = depower || alpha <= 0 ? 0 : polar(alpha, 4.6, 1.15, 18 * rad);
    const wingCd = depower ? .035 : .065 + wingCl ** 2 / (Math.PI * 3.2 * .78) + (alpha > 18 * rad ? .55 * Math.sin(alpha) ** 2 : 0);
    const pressure = .5 * 1.225 * apparent ** 2 * s.wing;
    let lx = -az / Math.max(.01, apparent), lz = ax / Math.max(.01, apparent);
    if (lx * fx + lz * fz < 0) { lx *= -1; lz *= -1; }
    const wingFx = pressure * (wingCl * lx + wingCd * ax / Math.max(.01, apparent));
    const wingFz = pressure * (wingCl * lz + wingCd * az / Math.max(.01, apparent));
    const surface = sampleWater(this.x, this.z, this.time, s.chop);
    const water = surface.height;
    const height = this.y - water;
    const nose = wave(this.x + fx * .8, this.z + fz * .8, this.time, s.chop);
    const tail = wave(this.x - fx * .8, this.z - fz * .8, this.time, s.chop);
    const right = wave(this.x + rx * .28, this.z + rz * .28, this.time, s.chop);
    const left = wave(this.x - rx * .28, this.z - rz * .28, this.time, s.chop);
    const waterPitch = Math.atan2(nose - tail, 1.6), waterRoll = Math.atan2(right - left, .56);
    const surfaceRate = surface.velocityY + surface.slopeX * this.vx + surface.slopeZ * this.vz;
    const entrySpeed = this.vy - surfaceRate;
    const wetHull = 1 - clamp(height / .23, 0, 1);
    const immersed = clamp((.85 - height) / .12, 0, 1);
    const flow = sampleWater(this.x, this.z, this.time, s.chop, Math.max(0, .85 - height));
    const waterForward = forward - flow.vx * fx - flow.vz * fz;
    const waterSideways = sideways - flow.vx * rx - flow.vz * rz;
    const aoa = (4 * rad + this.pitch) - Math.atan2(this.vy - flow.vy, Math.max(1, waterForward));
    const foilCl = polar(aoa, 5.2, 1.1, 14 * rad);
    const qFoil = .5 * 1025 * Math.max(0, waterForward) ** 2 * s.foil;
    const lift = qFoil * foilCl * immersed * Math.cos(this.roll);
    const foilDrag = qFoil * (.015 + foilCl ** 2 / (Math.PI * 6 * .82)) * immersed;
    const hullDrag = wetHull * (12 * speed + 6.5 * speed ** 2);
    const mass = 90, weight = mass * 9.81;
    const noseOffset = Math.sin(this.pitch) * .8, sideOffset = Math.sin(this.roll) * .28;
    const contactForce = (waterY, offset) => clamp((.1 - (this.y + offset - waterY)) * 2375, 0, weight * .625);
    const buoyancy = contactForce(nose, noseOffset) + contactForce(tail, -noseOffset)
      + contactForce(right, sideOffset) + contactForce(left, -sideOffset);
    const pumpForce = this.pumpPhase > 0 ? Math.sin(this.pumpPhase / .65 * Math.PI) : 0;
    const lateral = -waterSideways * (110 + Math.abs(waterForward) * 120) * Math.max(.2, immersed);
    const resistance = hullDrag + foilDrag + speed ** 2 * .6;
    // The supporting water normal pushes a wet hull down the wave face.
    // This fades naturally on takeoff, while orbital flow still loads the foil.
    const waveFx = -surface.slopeX * buoyancy, waveFz = -surface.slopeZ * buoyancy;
    const active = this.recovery <= 0;
    this.vx += ((active ? wingFx : 0) + waveFx + fx * pumpForce * (wind > 1 ? 95 : 0) + rx * lateral - resistance * this.vx / Math.max(.1, speed)) / mass * dt;
    this.vz += ((active ? wingFz : 0) + waveFz + fz * pumpForce * (wind > 1 ? 95 : 0) + rz * lateral - resistance * this.vz / Math.max(.1, speed)) / mass * dt;
    this.vy += (lift + buoyancy - weight - entrySpeed * wetHull * 600 - this.vy * 60 + pumpForce * Math.min(speed / 4, 1) * 230) / mass * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // Rider weight sets pitch; assisted mode adds a limited height/damping correction.
    const neutralPitch = weight / Math.max(100, qFoil) / 5.2 - 4 * rad;
    const assistPitch = s.assist ? clamp(neutralPitch + (.46 - height) * .13 - (this.vy - surfaceRate) * .08 - Math.atan2(flow.vy, Math.max(2, waterForward)), -.14, .1) : 0;
    const pitchTarget = balance * .17 + assistPitch * (1 - wetHull) + waterPitch * wetHull;
    this.pitchRate += ((pitchTarget - this.pitch) * (12 + wetHull * 18) - this.pitchRate * (6 + wetHull * 3)) * dt;
    this.pitch += this.pitchRate * dt;
    const rollTarget = (active ? -steer * .48 : .9) + waterRoll * wetHull;
    this.rollRate += ((rollTarget - this.roll) * 30 - this.rollRate * 9) * dt;
    this.roll += this.rollRate * dt;
    const turnTarget = active ? steer * (.13 + Math.min(Math.abs(forward), 9) * .068) : 0;
    this.yawRate += (turnTarget - this.yawRate) * dt * 3;
    this.heading = wrap(this.heading + this.yawRate * dt);
    let status = 'DISPLACEMENT';
    if (height > .22) status = 'FOILING';
    else if (speed > 2.5) status = 'BUILDING LIFT';
    if (!depower && alpha > 18 * rad) status = 'WING STALL';
    if (!depower && alpha < 2 * rad) status = 'WING LUFFING';
    if (height > .74) status = 'FOIL BREACH';
    if (Math.abs(aoa) > 14 * rad && height > .2) status = 'FOIL STALL';
    this.breachTime = height > .79 && speed > 3 ? this.breachTime + dt : Math.max(0, this.breachTime - dt * 2);
    if (active && (height > 1.6 || this.breachTime > .55 || (height < -.1 && entrySpeed < -2.6))) {
      this.wipeouts++; this.recovery = 2.4;
    }
    if (this.recovery > 0) {
      status = 'RECOVERING'; this.recovery -= dt;
      this.vx *= Math.exp(-dt * 1.5); this.vz *= Math.exp(-dt * 1.5);
      this.y = wave(this.x, this.z, this.time, s.chop) + .015;
      this.vy = surfaceRate; this.pitch *= Math.exp(-dt * 3); this.pitchRate *= Math.exp(-dt * 3);
    }
    if (height > .22 && active) { this.flightTime += dt; this.currentFlight += dt; }
    else this.currentFlight = 0;
    this.longestFlight = Math.max(this.longestFlight, this.currentFlight);
    this.topSpeed = Math.max(this.topSpeed, speed); this.distance += speed * dt;
    this.telemetry = { speed, forward, wind, wx, wz, apparent, beta, ...trimming, lift, height, foilAoA: aoa, status, drive: wingFx * fx + wingFz * fz, wingLoad: pressure * wingCl, immersed,
      waterHeight: water, waterPitch, waterRoll, surfaceRate, entrySpeed, wetHull, waveDrive: waveFx * fx + waveFz * fz,
      impact: wetHull * Math.max(0, -entrySpeed), foilFlow: flow.vy };
    return this.telemetry;
  }
}
