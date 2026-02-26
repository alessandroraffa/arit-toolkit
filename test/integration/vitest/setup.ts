/**
 * Integration test setup.
 *
 * Unlike unit tests, integration tests do NOT mock `vscode` globally.
 * Only bundle-level tests that require() dist/extension.js need a
 * minimal vscode stub — they handle it locally.
 *
 * Integration tests exercise real modules with real dependencies
 * (js-tiktoken, @anthropic-ai/tokenizer ranks, etc.) to catch
 * issues that mocks hide: WASM loading, JSON bundling, ESM/CJS
 * interop, and runtime type mismatches.
 */
