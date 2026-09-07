/**
 * Writes a SHA-256 checksum file next to the packaged .vsix.
 *
 * Called by semantic-release via @semantic-release/exec during the publish step.
 * By then semantic-release-vsce has already packaged the .vsix in its prepare
 * step, and @semantic-release/github has not yet uploaded assets — the exec
 * plugin is listed before it in release.config.mjs, and plugins run in array order
 * within each lifecycle step.
 *
 * The README tells users to verify a downloaded .vsix against this file, so a
 * release must never ship without it: this script exits non-zero rather than
 * let a release complete with the instruction pointing at something absent.
 *
 * Output format is the one `shasum -c` and `sha256sum -c` both accept:
 *
 *   <64 hex chars>  <filename>
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const vsixFiles = readdirSync(process.cwd()).filter((f) => f.endsWith('.vsix'));

if (vsixFiles.length === 0) {
  console.error('write-checksum: no .vsix found in the working directory.');
  process.exit(1);
}

for (const file of vsixFiles) {
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  const checksumFile = `${file}.sha256`;
  writeFileSync(checksumFile, `${digest}  ${file}\n`);
  console.log(`write-checksum: ${checksumFile} -> ${digest}`);
}
