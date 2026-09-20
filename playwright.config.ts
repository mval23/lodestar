import { defineConfig, devices } from '@playwright/test';

// End-to-end through a real browser, against the production build served with
// the production security headers, so the CSP is exercised rather than
// assumed. The Supabase API is stubbed at the network boundary: these tests
// are about the app's behaviour, and the database's own behaviour is covered
// by the pgTAP suite against a real Postgres.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Built with .env.e2e, so the app always points at the host the tests stub.
    command: 'npm run build:e2e && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
