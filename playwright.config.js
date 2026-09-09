import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5178', channel: 'chrome', headless: true },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5178', reuseExistingServer: true }
});
