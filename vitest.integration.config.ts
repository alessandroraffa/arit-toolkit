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
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/features/textStats/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/features/textStats/command.ts',
        'src/features/textStats/controller.ts',
        'src/features/textStats/statusBarItem.ts',
        'src/features/textStats/updateHandler.ts',
      ],
      reportsDirectory: 'coverage/integration',
      thresholds: {
        lines: 85,
        functions: 95,
        branches: 90,
        statements: 85,
      },
    },
  },
});
