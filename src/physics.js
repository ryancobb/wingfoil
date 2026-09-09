// SI units; horizontal coordinates x/z, heading zero points north (-z).
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rad = Math.PI / 180;
export const KNOTS = 1.94384;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const wave = (x, z, t, chop = 1) => chop * (0.045 * Math.sin(x * .19 + z * .11 - t * 1.3) + .025 * Math.sin(z * .43 - t * 1.8));
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
    Object.assign(this, { x: 0, z: 0, y: .08, vx: 0, vz: 0, vy: 0, heading: Math.PI / 2, pitch: 0, pitchRate: 0, roll: 0, yawRate: 0, time: 0, distance: 0, flightTime: 0, longestFlight: 0, currentFlight: 0, topSpeed: 0, wipeouts: 0, recovery: 0, breachTime: 0, pumpEnergy: 1, pumpPhase: 0, pumpCooldown: 0, telemetry: {} });
  }
  pump() {
    if (this.pumpEnergy < .24 || this.pumpCooldown > 0 || this.recovery > 0) return false;
    this.pumpEnergy -= .24; this.pumpPhase = .65; this.pumpCooldown = .75; return true;
  }
  step(dt, input = {}) {
    const { steer = 0, balance = 0, trim = .48, depower = false } = input;
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
    const idealTrim = clamp(1 - (beta / rad - 17) / 115, 0, 1);
    const alpha = beta - (5 + (1 - trim) * 115) * rad;
    const wingCl = depower || alpha <= 0 ? 0 : polar(alpha, 4.6, 1.15, 18 * rad);
    const wingCd = depower ? .035 : .065 + wingCl ** 2 / (Math.PI * 3.2 * .78) + (alpha > 18 * rad ? .55 * Math.sin(alpha) ** 2 : 0);
    const pressure = .5 * 1.225 * apparent ** 2 * s.wing;
    let lx = -az / Math.max(.01, apparent), lz = ax / Math.max(.01, apparent);
    if (lx * fx + lz * fz < 0) { lx *= -1; lz *= -1; }
    const wingFx = pressure * (wingCl * lx + wingCd * ax / Math.max(.01, apparent));
    const wingFz = pressure * (wingCl * lz + wingCd * az / Math.max(.01, apparent));
    const water = wave(this.x, this.z, this.time, s.chop);
    const height = this.y - water;
    const wetHull = 1 - clamp(height / .23, 0, 1);
    const immersed = clamp((.85 - height) / .12, 0, 1);
    const aoa = (4 * rad + this.pitch) - Math.atan2(this.vy, Math.max(1, forward));
    const foilCl = polar(aoa, 5.2, 1.1, 14 * rad);
    const qFoil = .5 * 1025 * Math.max(0, forward) ** 2 * s.foil;
    const lift = qFoil * foilCl * immersed * Math.cos(this.roll);
    const foilDrag = qFoil * (.015 + foilCl ** 2 / (Math.PI * 6 * .82)) * immersed;
    const hullDrag = wetHull * (12 * speed + 6.5 * speed ** 2);
    const mass = 90, weight = mass * 9.81;
    const buoyancy = clamp((.1 - height) * 9500, 0, weight * 2.5);
    const pumpForce = this.pumpPhase > 0 ? Math.sin(this.pumpPhase / .65 * Math.PI) : 0;
    const lateral = -sideways * (110 + Math.abs(forward) * 120) * Math.max(.2, immersed);
    const resistance = hullDrag + foilDrag + speed ** 2 * .6;
    const active = this.recovery <= 0;
    this.vx += ((active ? wingFx : 0) + fx * pumpForce * (wind > 1 ? 95 : 0) + rx * lateral - resistance * this.vx / Math.max(.1, speed)) / mass * dt;
    this.vz += ((active ? wingFz : 0) + fz * pumpForce * (wind > 1 ? 95 : 0) + rz * lateral - resistance * this.vz / Math.max(.1, speed)) / mass * dt;
    this.vy += (lift + buoyancy - weight - this.vy * (wetHull * 600 + 60) + pumpForce * Math.min(speed / 4, 1) * 230) / mass * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // Rider weight sets pitch; assisted mode adds a limited height/damping correction.
    const neutralPitch = weight / Math.max(100, qFoil) / 5.2 - 4 * rad;
    const assistPitch = s.assist ? clamp(neutralPitch + (.46 - height) * .13 - this.vy * .08, -.1, .05) : 0;
    const pitchTarget = balance * .17 + assistPitch;
    this.pitchRate += ((pitchTarget - this.pitch) * 12 - this.pitchRate * 6) * dt;
    this.pitch += this.pitchRate * dt;
    this.roll += ((active ? -steer * .48 : .9) - this.roll) * Math.min(1, dt * 4);
    const turnTarget = active ? steer * (.13 + Math.min(Math.abs(forward), 9) * .068) : 0;
    this.yawRate += (turnTarget - this.yawRate) * dt * 3;
    this.heading = wrap(this.heading + this.yawRate * dt);
    let status = 'DISPLACEMENT';
    if (height > .22) status = 'FOILING';
    else if (speed > 2.5) status = 'BUILDING LIFT';
    if (!depower && alpha > 23 * rad) status = 'WING STALL';
    if (!depower && alpha < 2 * rad) status = 'WING LUFFING';
    if (height > .74) status = 'FOIL BREACH';
    if (Math.abs(aoa) > 14 * rad && height > .2) status = 'FOIL STALL';
    this.breachTime = height > .79 && speed > 3 ? this.breachTime + dt : Math.max(0, this.breachTime - dt * 2);
    if (active && (height > 1.05 || this.breachTime > .35 || (height < -.1 && this.vy < -1.5))) {
      this.wipeouts++; this.recovery = 2.4;
    }
    if (this.recovery > 0) {
      status = 'RECOVERING'; this.recovery -= dt;
      this.vx *= Math.exp(-dt * 1.5); this.vz *= Math.exp(-dt * 1.5);
      this.y = water + .015; this.vy = 0; this.pitch *= Math.exp(-dt * 3);
    }
    if (height > .22 && active) { this.flightTime += dt; this.currentFlight += dt; }
    else this.currentFlight = 0;
    this.longestFlight = Math.max(this.longestFlight, this.currentFlight);
    this.topSpeed = Math.max(this.topSpeed, speed); this.distance += speed * dt;
    this.telemetry = { speed, forward, wind, wx, wz, apparent, beta, alpha, idealTrim, lift, height, foilAoA: aoa, status, drive: wingFx * fx + wingFz * fz, wingLoad: pressure * wingCl, immersed };
    return this.telemetry;
  }
}
