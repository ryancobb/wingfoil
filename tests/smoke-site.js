import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = new URL(process.argv[2] || 'http://127.0.0.1:4178/wingfoil/');
const builtHTML = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const expectedScript = builtHTML.match(/<script[^>]+src="([^"]+)"/)[1];
url.searchParams.set('debug', '');
url.searchParams.set('build', expectedScript.split('/').at(-1));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (new URL(response.url()).origin === url.origin && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const response = await page.goto(url.href, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    const script = await page.locator('script[type="module"]').getAttribute('src');
    assert.equal(script, expectedScript, 'Live HTML must load the exact reviewed build');
    await page.locator('#start').click();
    await page.waitForFunction(() => window.__drift?.sim.time > .25);
    if (mobile) {
      await page.locator('#depower').tap();
      assert.equal(await page.evaluate(() => window.__drift.input.depower), true);
      await page.locator('#depower').tap();
    }
    const graphics = await page.evaluate(() => window.__drift.graphics());
    assert.ok(graphics.calls > 0 && graphics.triangles > 50000);
    assert.equal(graphics.wind.visible, true);
    await page.locator('#pause').click();
    assert.equal(await page.locator('#pause-overlay').isVisible(), true);
    await page.locator('#resume').click();
    await page.screenshot({ path: `/private/tmp/drift-${url.hostname === '127.0.0.1' ? 'production-preview' : 'live'}-${mobile ? 'mobile' : 'desktop'}.png` });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ url: url.origin + url.pathname, mobile, script, calls: graphics.calls, triangles: graphics.triangles, errors }));
    await context.close();
  }
} finally { await browser.close(); }
