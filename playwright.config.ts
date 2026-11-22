import { defineConfig, devices } from '@playwright/test';

// E2E against the production build (`vite preview`), using the synthetic fixture in tests/fixtures
// (never GTABase data). iPhone 13 and Pixel 7 viewports, both on Chromium (needed for SW + offline emulation).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/leonida-tracker/', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/leonida-tracker/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  ],
});
