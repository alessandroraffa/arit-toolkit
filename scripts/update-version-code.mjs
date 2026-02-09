/**
 * Updates the versionCode field in package.json based on the current version.
 *
 * Called by semantic-release via @semantic-release/exec during the prepare step,
 * after @semantic-release/npm has already bumped the version field.
 *
 * Version code format: 1XXXYYYZZZ
 *   - 1        = fixed prefix
 *   - XXX      = major (zero-padded to 3 digits)
 *   - YYY      = minor (zero-padded to 3 digits)
 *   - ZZZ      = patch (zero-padded to 3 digits)
 *
 * Example: "1.1.2" → 1001001002
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagePath = resolve(__dirname, '..', 'package.json');

const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
const version = pkg.version;

const parts = version.split('.');
if (parts.length !== 3) {
  console.error(`Invalid version format: "${version}"`);
  process.exit(1);
}

const [major, minor, patch] = parts.map(Number);
const versionCode = 1_000_000_000 + major * 1_000_000 + minor * 1_000 + patch;

pkg.versionCode = versionCode;

writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

console.log(`Updated versionCode: ${version} → ${versionCode}`);
