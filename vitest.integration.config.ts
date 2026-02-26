import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  test: {
    root: resolve(__dirname),
    include: ['test/integration/vitest/**/*.test.ts'],
    globals: true,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/features/textStats/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      reportsDirectory: 'coverage/integration',
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
