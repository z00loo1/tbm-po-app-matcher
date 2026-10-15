// End-to-end tests. Locally/CI they run against a static server on this folder;
// set BASE_URL to test the published GitHub Pages site instead.
const { defineConfig, devices } = require('@playwright/test');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';
module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30000,
  reporter: [['list']],
  use: { baseURL: BASE_URL, acceptDownloads: true },
  projects: [
    // Chromium with iPhone 13 metrics (viewport, touch, mobile UA). Real WebKit/Safari is not run in CI.
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: BASE_URL, reuseExistingServer: true,
  },
});
