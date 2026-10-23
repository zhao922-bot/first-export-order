import { defineConfig, devices } from '@playwright/test';

const live = process.env.PAGES_BASE_URL;
const baseURL = live ?? 'http://127.0.0.1:4174/first-export-order/';
const parsed = new URL(baseURL);
if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.pathname.endsWith('/'))
  throw new Error('PAGES_BASE_URL 必须是带结尾 / 的 HTTP(S) 站点目录。');

export default defineConfig({
  testDir: './tests/pages',
  outputDir: 'test-results/pages',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/pages', open: 'never' }],
    ['json', { outputFile: 'test-results/pages-results.json' }],
  ],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'android-360',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } },
    },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
  ],
  ...(live
    ? {}
    : {
        webServer: {
          command:
            'pnpm build:pages && pnpm exec vite preview --outDir dist-pages --base=/first-export-order/ --host 127.0.0.1 --port 4174 --strictPort',
          url: baseURL,
          timeout: 120_000,
          reuseExistingServer: false,
        },
      }),
});
