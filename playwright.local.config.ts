import { defineConfig, devices } from '@playwright/test';
import { resolve, join } from 'node:path';

const packageRoot = resolve(process.env.PLAYTEST_PACKAGE_DIR ?? 'outputs/local-playtest-win-x64');

export default defineConfig({
  testDir: './tests',
  testMatch: ['distribution/**/*.spec.ts', 'e2e/playtest-rescue.spec.ts'],
  fullyParallel: true,
  workers: 2,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['json', { outputFile: 'test-results/local-playtest-results.json' }]],
  outputDir: 'test-results/local-playtest',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--no-proxy-server'] },
  },
  projects: [
    { name: 'package-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'package-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `"${join(packageRoot, 'runtime/node.exe')}" "${join(packageRoot, 'server.mjs')}" --lan --port=4187 --no-open`,
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
