import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/content/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/economy/**/*.ts', 'src/engine/debrief/evidence.ts'],
      reporter: ['text', 'html', 'json'],
      thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
