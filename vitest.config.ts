import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  test: {
    root: resolve(__dirname),
    include: ['test/unit/**/*.test.ts'],
    exclude: ['test/integration/**', 'test/e2e/**'],
    globals: true,
    setupFiles: ['test/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/extension.ts', 'src/**/*.d.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
