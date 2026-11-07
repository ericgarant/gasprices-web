// Run from tests/:  npm install && npx playwright install chromium && npm test
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 6000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Pixel 7'], // phone size, touch, mobile UA
    serviceWorkers: 'block', // the offline test opts in explicitly
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
    geolocation: { latitude: 45.5017, longitude: -73.5673 }, // downtown Montréal
    permissions: [],
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: `node ${path.join(__dirname, 'serve.js')}`,
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
  },
});
