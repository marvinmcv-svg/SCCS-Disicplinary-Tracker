import { defineConfig, devices } from '@playwright/test';

// SCCS Discipline Tracker — E2E suite. The Next.js dev server is managed
// outside this config (already running on :3000); tests just target it.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    // Optional: point at a pre-installed Chromium when the bundled browser
    // revision is not downloaded (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium).
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
    trace: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
