import { defineConfig } from '@playwright/test';
const softwareRendering = process.env.CI || process.env.WINGFOIL_SOFTWARE_RENDERING;
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5178', ...(process.env.CI ? {} : { channel: 'chrome' }), headless: true,
    ...(softwareRendering ? { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } : {}) },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5178', reuseExistingServer: true }
});
