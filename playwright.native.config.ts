import { defineConfig } from '@playwright/test';
import { nativeVersion, releaseRoot } from './tests/native-support/release';

export default defineConfig({
  testDir: './tests/native',
  outputDir: `./test-results/native-${nativeVersion}`,
  workers: 1,
  fullyParallel: false,
  timeout: 180000,
  reporter: [['list'], ['json', { outputFile: releaseRoot + '/PLAYWRIGHT_RESULTS.json' }]],
  use: { trace: 'retain-on-failure' },
});
