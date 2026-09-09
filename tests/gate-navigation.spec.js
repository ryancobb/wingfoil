import { test, expect } from '@playwright/test';

for (const [width, height] of [[1280, 900], [390, 844], [320, 568], [844, 390]]) {
  test(`gate compass tracks the course and fits the HUD at ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?debug'); await page.locator('#start').click();
    await expect(page.locator('#gate-navigation')).toBeHidden();
    await page.evaluate(() => {
      const { sim, input } = window.__drift;
      for (let i = 0; i < 2400; i++) { input.trim = sim.telemetry.idealTrim; sim.step(1 / 120, input); }
    });
    await expect(page.locator('#gate-distance')).toContainText('GATE 1');
    await expect(page.locator('#gate-navigation')).toBeVisible();
    const bounds = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
      return { gate: rect('#gate-navigation'), controls: rect('.controls'), foil: rect('.foil-monitor') };
    });
    expect(bounds.gate.x).toBeGreaterThanOrEqual(0); expect(bounds.gate.right).toBeLessThanOrEqual(width);
    expect(bounds.gate.y).toBeGreaterThanOrEqual(0); expect(bounds.gate.bottom).toBeLessThan(bounds.controls.y);
    const overlap = Math.max(0, Math.min(bounds.gate.right, bounds.foil.right) - Math.max(bounds.gate.x, bounds.foil.x)) * Math.max(0, Math.min(bounds.gate.bottom, bounds.foil.bottom) - Math.max(bounds.gate.y, bounds.foil.y));
    expect(overlap).toBe(0);
    await page.locator('#pause').click();
    for (const [offset, direction] of [[0, 'Straight ahead'], [-Math.PI / 2, 'Turn right'], [Math.PI / 2, 'Turn left'], [Math.PI, 'Behind you']]) {
      await page.evaluate(offset => {
        const { sim } = window.__drift, buoys = window.__drift.graphics().buoys;
        const x = (buoys[0].position[0] + buoys[1].position[0]) / 2, z = (buoys[0].position[2] + buoys[1].position[2]) / 2;
        sim.heading = Math.atan2(x - sim.x, -(z - sim.z)) + offset;
      }, offset);
      await expect(page.locator('#gate-direction')).toHaveText(direction);
      await expect(page.locator('#gate-navigation')).toHaveAttribute('aria-label', new RegExp(direction));
    }
    await page.evaluate(() => document.querySelector('#reset').click());
    await expect(page.locator('#gate-navigation')).toBeHidden();
  });
}
