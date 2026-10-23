import { defineConfig } from '@playwright/test';
import { nativeVersion, releaseRoot } from './tests/native-support/release';
export default defineConfig({
  testDir: './tests/native-android',
  outputDir: `./test-results/android-${nativeVersion}`,
  workers: 1,
  timeout: 300000,
  reporter: [['list'], ['json', { outputFile: releaseRoot + '/ANDROID_PLAYWRIGHT_RESULTS.json' }]],
});
