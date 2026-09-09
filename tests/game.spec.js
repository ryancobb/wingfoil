import { test, expect } from '@playwright/test';

test('desktop riding, keyboard, pause, equipment settings and reset', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?debug');
  await page.getByRole('button', { name: "Let's ride" }).click();
  await page.keyboard.down('KeyE');
  await expect.poll(() => page.evaluate(() => window.__drift.input.trim)).toBeGreaterThan(.45);
  await page.keyboard.up('KeyE');
  expect(await page.evaluate(() => window.__drift.input.trim)).toBeGreaterThan(.45);
  const heading = await page.evaluate(() => window.__drift.sim.heading);
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.__drift.sim.heading)).toBeGreaterThan(heading);
  await page.keyboard.up('KeyD');
  expect(await page.evaluate(() => window.__drift.sim.heading)).toBeGreaterThan(heading);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const time = await page.evaluate(() => window.__drift.sim.time);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__drift.sim.time)).toBe(time);
  await page.getByRole('button', { name: 'Keep riding' }).click();
  await page.getByRole('button', { name: 'Session settings' }).click();
  await page.locator('#setting-wing').selectOption('6');
  await page.locator('#setting-assist').uncheck();
  await page.getByRole('button', { name: 'Back to the water' }).click();
  await expect(page.locator('#mode-label')).toHaveText('MANUAL SIMULATION');
  expect(await page.evaluate(() => window.__drift.sim.settings.wing)).toBe(6);
  await page.getByRole('button', { name: 'Restart session' }).click();
  expect(await page.evaluate(() => window.__drift.sim.distance)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`mobile controls fit and work at ${size.width} × ${size.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto('/?debug'); await page.locator('#start').tap();
    await expect(page.locator('.foil-monitor')).toBeVisible();
    await expect(page.locator('.trim-steps')).toHaveCount(0);
    const targets = [];
    for (const id of ['joystick', 'trim', 'pump', 'depower', 'settings', 'pause']) {
      const box = await page.locator('#' + id).boundingBox();
      expect(box.width, id + ' width').toBeGreaterThanOrEqual(44);
      expect(box.height, id + ' height').toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
      targets.push({ id, ...box });
    }
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      const overlap = Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const stick = await page.locator('#joystick').boundingBox(), trim = await page.locator('#trim').boundingBox();
    const cdp = await context.newCDPSession(page);
    const a = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 1 };
    const b = { x: trim.x + trim.width * .65, y: trim.y + trim.height / 2, id: 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...a, x: a.x + 22, y: a.y + 8 }, b] });
    await expect.poll(() => page.evaluate(() => window.__drift.input.steer)).toBeGreaterThan(.3);
    expect(await page.evaluate(() => window.__drift.input.trim)).toBeGreaterThan(.55);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.__drift.input.steer)).toBe(0);
    const flag = await page.locator('#depower').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: flag.x + flag.width / 2, y: flag.y + flag.height / 2, id: 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(await page.evaluate(() => window.__drift.input.depower)).toBe(false);
    await page.locator('#depower').tap();
    expect(await page.evaluate(() => window.__drift.input.depower)).toBe(true);
    await expect(page.locator('#depower')).toHaveAccessibleName('Power up wing');
    await page.locator('#depower').tap();
    expect(await page.evaluate(() => window.__drift.input.depower)).toBe(false);
    await page.locator('#pump').tap();
    expect(await page.evaluate(() => window.__drift.sim.pumpEnergy)).toBeLessThan(.9);
    await context.close();
  });
}

test('mobile settings pause play, swap controls, persist preferences and keep hold mode available', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?debug'); await page.locator('#start').tap();
  await page.locator('#settings').tap();
  const time = await page.evaluate(() => window.__drift.sim.time);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__drift.sim.time)).toBe(time);
  await page.locator('#swap-controls').check(); await page.locator('#tap-flag').uncheck();
  await page.getByRole('button', { name: 'Back to the water' }).tap();
  expect((await page.locator('#joystick').boundingBox()).x).toBeGreaterThan((await page.locator('#trim').boundingBox()).x);
  await page.reload(); await page.locator('#start').tap();
  expect((await page.locator('#joystick').boundingBox()).x).toBeGreaterThan((await page.locator('#trim').boundingBox()).x);
  const flag = await page.locator('#depower').boundingBox(), cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: flag.x + 30, y: flag.y + 24, id: 1 }] });
  expect(await page.evaluate(() => window.__drift.input.depower)).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(await page.evaluate(() => window.__drift.input.depower)).toBe(false);
  await page.locator('#settings').tap();
  await page.getByRole('button', { name: 'Restart session', exact: true }).tap();
  await expect(page.locator('#settings-dialog')).not.toBeVisible();
  await page.waitForTimeout(150);
  expect(errors).toEqual([]);
  await page.locator('#settings').tap(); await page.getByRole('button', { name: 'How to ride', exact: true }).tap();
  await expect(page.locator('#overlay')).toBeVisible();
  await context.close();
});

test('sustained flight unlocks a course and crossing between buoys counts', async ({ page }) => {
  await page.goto('/?debug'); await page.locator('#start').click();
  await page.evaluate(() => {
    const { sim, input } = window.__drift;
    for (let i = 0; i < 2400; i++) { input.trim = sim.telemetry.idealTrim; sim.step(1 / 120, input); }
  });
  await expect.poll(() => page.evaluate(() => window.__drift.getState().lesson)).toBe(3);
  await expect(page.locator('#objective-title')).toContainText('GATE 1');
  // Fly directly through the first gate's plane at its midpoint.
  await page.evaluate(() => {
    const { sim } = window.__drift;
    const h = sim.heading + .38;
    sim.x += Math.sin(h) * 99; sim.z -= Math.cos(h) * 99;
    sim.heading = h; sim.vx = Math.sin(h) * 12; sim.vz = -Math.cos(h) * 12;
  });
  await expect.poll(() => page.evaluate(() => window.__drift.getState().gates), { timeout: 5000 }).toBe(1);
});

test('trim slider, target band and feedback agree through easing, stall and flagging', async ({ page }) => {
  await page.goto('/?debug');
  // Keep the intro open to freeze motion while testing fixed apparent wind.
  const setTrim = async value => {
    await page.locator('#trim').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input')); }, value);
    await page.evaluate(() => { const { sim, input } = window.__drift; sim.step(0, input); });
  };
  await setTrim(10); await expect(page.locator('#trim-feedback')).toContainText('Sheet in');
  await setTrim(90); await expect(page.locator('#trim-feedback')).toContainText('Ease out');
  await setTrim(36.5); await expect(page.locator('#trim-feedback')).toHaveText('Clean airflow');
  await expect(page.locator('#trim')).toHaveAttribute('aria-valuetext', /Clean airflow/);
  const offset = await page.evaluate(() => {
    const slider = document.querySelector('#trim'), target = document.querySelector('#sweet-spot');
    const thumb = parseFloat(getComputedStyle(slider).getPropertyValue('--thumb-size'));
    const actual = target.offsetLeft, expected = thumb / 2 + window.__drift.sim.telemetry.idealTrim * (slider.clientWidth - thumb);
    return Math.abs(actual - expected);
  });
  expect(offset).toBeLessThan(1);
  await page.evaluate(() => { const { sim, input } = window.__drift; sim.heading = 0; sim.step(0, input); });
  await expect(page.locator('#trim-feedback')).toHaveText('Steer across wind');
  await expect(page.locator('#sweet-spot')).toBeHidden();
  await page.evaluate(() => { const { sim, input } = window.__drift; input.depower = true; sim.step(0, input); });
  await expect(page.locator('#trim-feedback')).toHaveText('Wing flagged');
  await expect(page.locator('#coach-text')).toContainText('Power up');
  await expect(page.locator('#sweet-spot')).toBeHidden();
});

for (const width of [1280, 390]) test(`working trim stays visible on a close reach and at the eased endpoint (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/?debug');
  // Freeze gameplay under the intro while advancing a real close-reach flight.
  await page.evaluate(() => {
    const { sim, input } = window.__drift;
    sim.reset(); sim.settings.gusts = sim.settings.chop = 0; sim.heading = Math.PI / 3;
    for (let i = 0; i < 7200; i++) sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38 });
    input.trim = sim.telemetry.idealTrim;
    document.querySelector('#trim').value = input.trim * 100;
    sim.step(0, input);
  });
  await expect(page.locator('#trim-feedback')).toHaveText('Clean airflow');
  await expect(page.locator('#sweet-spot')).toBeVisible();
  const closeBand = await page.locator('#sweet-spot').boundingBox();
  await page.evaluate(() => {
    const { sim, input } = window.__drift;
    sim.reset(); sim.heading = 134 * Math.PI / 180; input.trim = 0;
    document.querySelector('#trim').value = 0; sim.step(0, input);
  });
  await expect(page.locator('#trim-value')).toHaveText('0%');
  await expect(page.locator('#trim-feedback')).toHaveText('Clean airflow');
  await expect(page.locator('#sweet-spot')).toBeVisible();
  const endpointBand = await page.locator('#sweet-spot').boundingBox();
  const slider = await page.locator('#trim').boundingBox();
  expect(endpointBand.width).toBeLessThan(closeBand.width);
  expect(endpointBand.x).toBeGreaterThanOrEqual(slider.x);
  expect(endpointBand.x + endpointBand.width).toBeLessThan(slider.x + slider.width * .15);
  await page.evaluate(() => {
    const { sim, input } = window.__drift;
    input.trim = .1; document.querySelector('#trim').value = 10; sim.step(0, input);
  });
  await expect(page.locator('#trim-feedback')).toContainText('Ease out');
});
