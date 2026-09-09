import { test, expect } from '@playwright/test';

test('GPU ocean agrees with physics nearby and buoy sampling through the distant falloff', async ({ page }) => {
  await page.goto('/?debug');
  const samples = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { createOcean } = await import('/src/graphics/ocean.js');
    const { sampleWater, sampleRenderedWater } = await import('/src/water.js');
    const renderer = new THREE.WebGLRenderer(); renderer.setSize(1, 1);
    const scene = new THREE.Scene(), ocean = createOcean(scene);
    const objects = [...scene.children], near = objects[0];
    for (const mesh of objects.slice(2)) scene.remove(mesh);
    // Read back the actual ocean vertex shader's displaced height and normal
    // inputs, before lighting/tone mapping, at mesh vertices and the far ring.
    near.material.fragmentShader = `varying vec3 vWorld; varying vec4 vWater;
      void main(){gl_FragColor=vec4(vWorld.y,vWater.yz,1.);}`;
    near.material.transparent = false;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType });
    const camera = new THREE.OrthographicCamera(-.5, .5, .5, -.5, .1, 2000);
    camera.up.set(0, 0, -1);
    const results = [];
    try {
      for (const [x, z, time, chop, dx = 0, dz = 0] of [
        [0, 0, 0, .6], [17, -24, 5, 2], [-57, 89, 103, .6], [23, -31, 4, 0],
        [134, -72, 12.3, 2, 67.5, 0], [134, -72, 12.3, 2, -78.75, 9],
        [134, -72, 12.3, 2, 9, 88.875], [134, -72, 12.3, 2, 0, -90],
        [134, -72, 12.3, 2, 96, 28],
      ]) {
        camera.position.set(x, 1000, z); camera.lookAt(x, 0, z);
        ocean.update({ x: x - dx, y: 0, z: z - dz, time, heading: 0, yawRate: 0, vx: 0, vz: 0, settings: { chop }, telemetry: {} }, camera.position, 0);
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
        const water = dx === 0 && dz === 0 ? sampleWater(x, z, time, chop) : sampleRenderedWater(x, z, time, chop, x - dx, z - dz);
        results.push({ gpu: Array.from(pixel), cpu: [water.height, water.slopeX, water.slopeZ] });
      }
    } finally {
      target.dispose();
      for (const mesh of objects) { mesh.geometry.dispose(); mesh.material.dispose(); }
      renderer.dispose();
    }
    return results;
  });
  for (const { gpu, cpu } of samples) {
    expect(gpu[3]).toBe(1);
    // Float interpolation/readback varies across native GPUs and SwiftShader.
    // A 1 mm height / .001 slope tolerance still detects displacement or
    // falloff mismatches while allowing the observed submillimetre variation.
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(gpu[i] - cpu[i]), `${['height', 'slopeX', 'slopeZ'][i]}: GPU ${gpu[i]}, CPU ${cpu[i]}`).toBeLessThan(.001);
    }
  }
});

test('wave settings change the riding surface and rough water survives pause and restart', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto('/?debug'); await page.locator('#start').click();
  for (const [value, label] of [['0', 'Flat'], ['200', 'Rough seas']]) {
    await page.locator('#settings').click();
    await page.locator('#setting-chop').fill(value);
    await expect(page.locator('#setting-chop-value')).toHaveText(label);
    await page.getByRole('button', { name: 'Back to the water' }).click();
    await expect.poll(() => page.evaluate(() => window.__drift.sim.settings.chop)).toBe(Number(value) / 100);
    if (value === '0') await expect.poll(() => page.evaluate(() => window.__drift.sim.telemetry.waterHeight)).toBe(0);
  }
  await page.evaluate(() => {
    const { sim, input } = window.__drift;
    sim.reset();
    for (let i = 0; i < 1800; i++) sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38 });
    input.trim = sim.telemetry.idealTrim;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('rough-water.png') });
  await page.locator('#pause').click();
  const water = await page.evaluate(() => window.__drift.sim.telemetry.waterHeight);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__drift.sim.telemetry.waterHeight)).toBe(water);
  await page.getByRole('button', { name: 'Keep riding' }).click();
  await page.locator('#reset').click();
  const state = await page.evaluate(() => ({ height: window.__drift.sim.telemetry.height, wipeouts: window.__drift.sim.wipeouts, graphics: window.__drift.graphics() }));
  expect(Math.abs(state.height)).toBeLessThan(.2);
  expect(state.wipeouts).toBe(0);
  expect(state.graphics.triangles).toBeLessThan(120000);
  expect(errors).toEqual([]);
});

test('changing Waves during a paused flight preserves clearance and avoids an instant wipeout', async ({ page }) => {
  await page.goto('/?debug'); await page.locator('#start').click();
  await page.locator('#settings').click();
  await page.locator('#setting-chop').fill('0');
  const before = await page.evaluate(() => {
    const { sim, input } = window.__drift;
    sim.settings.gusts = 0; sim.reset();
    for (let i = 0; i < 3961; i++) sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38 });
    input.trim = sim.telemetry.idealTrim; sim.step(0, input);
    return { height: sim.telemetry.height, entrySpeed: sim.telemetry.entrySpeed, time: sim.time };
  });
  for (const value of ['200', '0', '200']) {
    await page.locator('#setting-chop').fill(value);
    const after = await page.evaluate(() => {
      const { sim } = window.__drift;
      return { height: sim.telemetry.height, entrySpeed: sim.telemetry.entrySpeed, time: sim.time, wipeouts: sim.wipeouts, recovery: sim.recovery };
    });
    expect(after.height).toBeCloseTo(before.height, 10);
    expect(after.entrySpeed).toBeCloseTo(before.entrySpeed, 10);
    expect(after.time).toBe(before.time);
    expect(after.wipeouts).toBe(0); expect(after.recovery).toBe(0);
  }
  await page.getByRole('button', { name: 'Back to the water' }).click();
  await expect.poll(() => page.evaluate(() => window.__drift.sim.time)).toBeGreaterThan(before.time);
  expect(await page.evaluate(() => window.__drift.sim.wipeouts)).toBe(0);
});

test('course buoy positions and bank match the visible ocean near and beyond its edge', async ({ page }) => {
  await page.goto('/?debug');
  const samples = await page.evaluate(async () => {
    const { createScene } = await import('/src/scene.js');
    const { Simulation } = await import('/src/physics.js');
    const { wave, sampleRenderedWater } = await import('/src/water.js');
    const container = document.createElement('div');
    container.style.cssText = 'width:600px;height:400px'; document.body.append(container);
    const scene = createScene(container), sim = new Simulation({ chop: 2 });
    sim.x = 134; sim.z = -72; sim.time = 12.3;
    sim.y = wave(sim.x, sim.z, sim.time, sim.settings.chop) + .08;
    const input = { trim: .38, balance: 0, steer: 0, depower: false };
    sim.step(0, input);
    const results = [];
    for (const distance of [35, 78, 115]) {
      const gate = { x: sim.x + distance, z: sim.z + 20, heading: .38 };
      scene.render(sim, input, 0, gate, false);
      for (const buoy of scene.inspect().buoys) {
        const [x, y, z] = buoy.position;
        const water = sampleRenderedWater(x, z, sim.time, sim.settings.chop, sim.x, sim.z);
        const sx = water.slopeX * Math.cos(gate.heading) + water.slopeZ * Math.sin(gate.heading);
        const sz = -water.slopeX * Math.sin(gate.heading) + water.slopeZ * Math.cos(gate.heading);
        results.push({ distance, y, expectedY: water.height, pitch: buoy.pitch, expectedPitch: -Math.atan(sz) * .6, roll: buoy.roll, expectedRoll: Math.atan(sx) * .6 });
      }
    }
    return results;
  });
  expect(samples).toHaveLength(6);
  for (const sample of samples) {
    expect(sample.y).toBeCloseTo(sample.expectedY, 10);
    expect(sample.pitch).toBeCloseTo(sample.expectedPitch, 10);
    expect(sample.roll).toBeCloseTo(sample.expectedRoll, 10);
    if (sample.distance > 90) expect(sample.y).toBe(0);
  }
});
