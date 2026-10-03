import { defineConfig, devices } from '@playwright/test';

// Screenshots for the README, taken the same way the end-to-end tests run:
// the production build against a stubbed Supabase. See screenshots.spec.ts.
// Today is pinned to the 23rd of this month, so the Overview's pace and the
// bills coming up read the same whatever day the pictures are retaken.
process.env.E2E_TODAY ??= `${new Date().toISOString().slice(0, 7)}-23`;

export default defineConfig({
  testDir: '.',
  testMatch: 'screenshots.spec.ts',
  outputDir: '../../test-results/readme',
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
    { name: 'phone', use: { ...devices['iPhone 15 Pro'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build:e2e && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
