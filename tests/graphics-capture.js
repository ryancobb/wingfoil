import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
await page.goto('http://127.0.0.1:5178/?debug'); await page.locator('#start').click();
for (const state of [
  { name: 'reach', heading: Math.PI / 2, trim: .38, depower: false },
  { name: 'foiling', heading: Math.PI / 2, trim: .82, depower: false, speed: 10, height: .46 },
  { name: 'opposite', heading: -Math.PI / 2, trim: .65, depower: false, speed: 6, height: .46 },
  { name: 'flagged', heading: -Math.PI / 2, trim: .65, depower: true, speed: 6, height: .46 },
]) {
  await page.evaluate(s => {
    const { sim, input } = window.__drift;
    sim.reset(); sim.heading = s.heading;
    // Build a settled flight rather than teleporting a stationary foil to speed
    // with its high takeoff pitch still applied (which legitimately breaches).
    if (s.speed) for (let i = 0; i < 2400; i++) sim.step(1 / 120, { trim: sim.telemetry.idealTrim ?? .38 });
    input.trim = s.trim; input.depower = s.depower;
    document.querySelector('#trim').value = s.trim * 100;
  }, state);
  await page.waitForTimeout(1500);
  console.log(state.name, await page.evaluate(() => window.__drift.graphics()));
  await page.screenshot({ path: `/private/tmp/drift-${state.name}.png` });
}
console.log('ERRORS', errors);
await browser.close();
if (errors.length) process.exitCode = 1;
