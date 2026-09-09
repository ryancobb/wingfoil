import { clamp } from '../physics.js';

export function createFlagAnimation() {
  const state = { phase: 0, strength: 0 };
  let previousTime = 0;
  return {
    update(time, wind, dt) {
      if (time < previousTime) state.phase = 0;
      previousTime = time;
      state.strength = clamp(wind / 12, 0, 1);
      // Changing wind affects future motion without rewriting the phase history.
      state.phase = (state.phase + Math.max(0, dt) * (3 + state.strength * 5)) % (Math.PI * 2);
      return state;
    },
  };
}
