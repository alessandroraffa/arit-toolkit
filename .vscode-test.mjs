import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test/integration/**/*.test.js',
  // VS Code 1.136.1 renamed the macOS executable from Electron to Code, while
  // @vscode/test-electron 2.5.2 still resolves the former name. Keep the host
  // matrix deterministic until the harness supports the new app layout.
  version: '1.128.0',
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true,
  },
  launchArgs: ['--disable-extensions'],
});
