import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL points the suite at an already running server (CI: the built
// container, with its real CSP and COEP headers). Without it, `vite preview`
// serves the production build.
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? 'http://127.0.0.1:4173/';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  ...(external
    ? {}
    : {
        webServer: {
          command: 'npm run build && npx vite preview --host 127.0.0.1',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
