import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) test(`new graphics compile and wing poses remain usable (${mobile ? 'mobile' : 'desktop'})`, async ({ browser }) => {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto('/?debug'); await page.locator('#start').click();
  for (const heading of [Math.PI / 2, -Math.PI / 2]) {
    const changedAt = await page.evaluate(h => {
      const { sim, input } = window.__drift;
      sim.heading = h; sim.vx = Math.sin(h) * 6; sim.vz = -Math.cos(h) * 6; sim.y = .46;
      input.trim = .65; input.depower = false;
      return sim.time;
    }, heading);
    // The first requested tack may already match the previous frame. Wait until
    // the new input has actually rendered before checking that its pose settled.
    await expect.poll(() => page.evaluate(() => window.__drift.sim.time)).toBeGreaterThan(changedAt);
    await expect.poll(() => page.evaluate(() => window.__drift.graphics().rig.tack)).toBe(heading > 0 ? -1 : 1);
    await expect.poll(() => page.evaluate(() => {
      const rig = window.__drift.graphics().rig;
      return Math.abs(Math.atan2(Math.sin(rig.yaw - rig.heading), Math.cos(rig.yaw - rig.heading)));
    })).toBeLessThan(.03);
    const graphics = await page.evaluate(() => window.__drift.graphics());
    expect(graphics.rig.armReachError).toBeLessThan(.08);
    expect(Math.abs(Math.atan2(Math.sin(graphics.rig.yaw - graphics.rig.heading), Math.cos(graphics.rig.yaw - graphics.rig.heading)))).toBeLessThan(.03);
    expect(graphics.calls).toBeLessThan(160);
    expect(graphics.triangles).toBeLessThan(120000);
    expect(graphics.wind.visible).toBe(true);
  }
  await page.evaluate(() => { window.__drift.input.depower = true; });
  await expect.poll(() => page.evaluate(() => window.__drift.graphics().rig.flagAmount)).toBeGreaterThan(.95);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__drift.graphics().rig.armReachError)).toBeLessThan(.08);
  await page.locator('#settings').click();
  await page.locator('#menu-wind').click();
  await expect.poll(() => page.evaluate(() => window.__drift.graphics().wind.visible)).toBe(false);
  await page.locator('#menu-wind').click();
  await expect.poll(() => page.evaluate(() => window.__drift.graphics().wind.visible)).toBe(true);
  await page.getByRole('button', { name: 'Back to the water' }).click();
  const before = await page.evaluate(() => window.__drift.graphics().geometries);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__drift.graphics().geometries)).toBe(before);
  expect(errors).toEqual([]);
  await context.close();
});
