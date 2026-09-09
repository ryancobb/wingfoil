// SI units. A shared height field keeps hull contacts, foil flow and the GPU
// surface in agreement. Nearby swell frequencies produce natural wave sets;
// the second harmonic sharpens crests without an overturning fluid solver.
export const WAVE_COMPONENTS = [
  { amplitude: .48, x: .12, z: .22, sharpness: .18, phase: .4 },
  { amplitude: .18, x: .08, z: .32, sharpness: .16, phase: 2.1 },
  { amplitude: .085, x: -.36, z: .18, sharpness: .12, phase: 4.2 },
  { amplitude: .035, x: .68, z: .44, sharpness: .08, phase: 1.3 },
].map(w => ({ ...w, k: Math.hypot(w.x, w.z), speed: Math.sqrt(9.81 * Math.hypot(w.x, w.z)) }));

export function wave(x, z, t, chop = 1) {
  let height = 0;
  for (const w of WAVE_COMPONENTS) {
    const p = x * w.x + z * w.z - t * w.speed + w.phase;
    height += chop * w.amplitude * (Math.sin(p) - w.sharpness * Math.cos(2 * p));
  }
  return height;
}

// Orbital flow decays below the surface, especially for short chop. The
// surface's time derivative differs from its rate along a moving board.
export function sampleWater(x, z, t, chop = 1, depth = 0) {
  let height = 0, slopeX = 0, slopeZ = 0, velocityY = 0, vx = 0, vy = 0, vz = 0;
  for (const w of WAVE_COMPONENTS) {
    const p = x * w.x + z * w.z - t * w.speed + w.phase;
    const a = chop * w.amplitude, sin = Math.sin(p), cos = Math.cos(p);
    const sin2 = Math.sin(2 * p), cos2 = Math.cos(2 * p);
    const derivative = a * (cos + 2 * w.sharpness * sin2);
    height += a * (sin - w.sharpness * cos2);
    slopeX += derivative * w.x; slopeZ += derivative * w.z;
    velocityY -= derivative * w.speed;
    const decay = Math.exp(-w.k * Math.max(0, depth));
    const horizontal = a * w.speed * (sin * decay - 2 * w.sharpness * cos2 * decay * decay);
    vx += horizontal * w.x / w.k; vz += horizontal * w.z / w.k;
    vy -= a * w.speed * (cos * decay + 2 * w.sharpness * sin2 * decay * decay);
  }
  return { height, slopeX, slopeZ, velocityY, vx, vy, vz };
}

export const OCEAN_FADE_START = 65, OCEAN_HALF_SIZE = 90;

// Floating scenery follows the same local-to-distant transition as the mesh.
// Include the falloff's derivative so banking follows the tapered surface too.
export function sampleRenderedWater(x, z, t, chop, centerX, centerZ) {
  const water = sampleWater(x, z, t, chop);
  const dx = x - centerX, dz = z - centerZ;
  const u = Math.max(0, Math.min(1, (Math.max(Math.abs(dx), Math.abs(dz)) - OCEAN_FADE_START) / (OCEAN_HALF_SIZE - OCEAN_FADE_START)));
  const fade = 1 - u * u * (3 - 2 * u);
  const derivative = -6 * u * (1 - u) / (OCEAN_HALF_SIZE - OCEAN_FADE_START);
  const alongX = Math.abs(dx) >= Math.abs(dz);
  return {
    height: water.height * fade,
    slopeX: water.slopeX * fade + (alongX ? water.height * derivative * Math.sign(dx) : 0),
    slopeZ: water.slopeZ * fade + (alongX ? 0 : water.height * derivative * Math.sign(dz)),
  };
}

// Generate both height and exact derivatives from the same coefficients as
// the CPU sampler; no separately maintained lighting or foam wave patterns.
const gl = n => Number.isInteger(n) ? `${n}.0` : String(n);
export const WATER_GLSL = `
vec4 waterSurface(vec2 p, float time, float chop) {
  vec4 water = vec4(0.0);
  ${WAVE_COMPONENTS.map(w => `{
    float phase = dot(p, vec2(${gl(w.x)}, ${gl(w.z)})) - time * ${gl(w.speed)} + ${gl(w.phase)};
    float a = chop * ${gl(w.amplitude)};
    float shape = sin(phase) - ${gl(w.sharpness)} * cos(2.0 * phase);
    float slope = a * (cos(phase) + ${gl(2 * w.sharpness)} * sin(2.0 * phase));
    water.xyz += vec3(a * shape, slope * ${gl(w.x)}, slope * ${gl(w.z)});
    water.w += a * max(0.0, sin(phase) - 0.72);
  }`).join('\n')}
  return water;
}
vec4 renderedWaterSurface(vec2 p, float time, float chop, vec2 offset) {
  vec4 water = waterSurface(p, time, chop);
  float u = clamp((max(abs(offset.x), abs(offset.y)) - ${gl(OCEAN_FADE_START)}) / ${gl(OCEAN_HALF_SIZE - OCEAN_FADE_START)}, 0.0, 1.0);
  float fade = 1.0 - u * u * (3.0 - 2.0 * u);
  float derivative = -6.0 * u * (1.0 - u) / ${gl(OCEAN_HALF_SIZE - OCEAN_FADE_START)};
  vec2 gradient = abs(offset.x) >= abs(offset.y) ? vec2(sign(offset.x), 0.0) : vec2(0.0, sign(offset.y));
  water.yz = water.yz * fade + water.x * derivative * gradient;
  water.xw *= fade;
  return water;
}`;
