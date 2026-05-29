/* global Buffer, console */
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

writeFileSync(
  resolve(__dirname, 'valid-with-skill-md.skill'),
  Buffer.from(zipSync({ 'SKILL.md': strToU8('# Skill\n\nDescription.\n') }))
);

writeFileSync(
  resolve(__dirname, 'valid-no-skill-md.skill'),
  Buffer.from(zipSync({ 'README.md': strToU8('# README\n') }))
);

writeFileSync(
  resolve(__dirname, 'valid-empty-skill-md.skill'),
  Buffer.from(zipSync({ 'SKILL.md': new Uint8Array(0) }))
);

writeFileSync(
  resolve(__dirname, 'valid-with-companions.skill'),
  Buffer.from(
    zipSync({
      'SKILL.md': strToU8('# Skill\n'),
      'assets/logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      'docs/usage.md': strToU8('# Usage\n'),
    })
  )
);

writeFileSync(resolve(__dirname, 'invalid-not-zip.skill'), Buffer.from('not a zip file'));

console.log('Fixtures generated.');
