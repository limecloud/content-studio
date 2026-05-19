import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.playwright-mcp/e2e-report', open: 'never' }],
  ],
  outputDir: '.playwright-mcp/e2e-results',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
