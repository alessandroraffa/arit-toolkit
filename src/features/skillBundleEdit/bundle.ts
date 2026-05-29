import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

/**
 * A non-`SKILL.md` entry preserved verbatim across an edit-and-repack cycle.
 *
 * `localBlock` is the exact Local File Header + name + extra + file data bytes.
 * `centralHeader` is the exact Central Directory record. The only field mutated
 * on write is the 4-byte local-header-offset inside `centralHeader`, which is
 * structurally required when an earlier entry changes size (see PLAN-004
 * Decision 2, entry-splicing). Every other byte is copied unchanged.
 */
export interface CompanionEntry {
  name: string;
  localBlock: Uint8Array;
  centralHeader: Uint8Array;
}

export interface SkillBundleContent {
  skillMd: string | undefined;
  companions: readonly CompanionEntry[];
}

export class SkillBundleError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'SkillBundleError';
  }
}

const SKILL_MD_NAME = 'SKILL.md';
const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const CDH_FIXED_SIZE = 46;
const LFH_FIXED_SIZE = 30;
const ZIP64_EXTRA_SIG = 0x0001;
const GP_ENCRYPTED_BIT = 0x0001;

function dv(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Rejects archive entry names that could escape the intended location once
 * written into the repacked central directory. Minimal per-segment denylist
 * (PLAN-004 / WS-0017 disposition): null byte, absolute/UNC/drive-letter
 * prefixes, and `.`/`..` path segments. Names that merely contain `..` as a
 * non-segment substring (e.g. `notes..final.md`) are accepted.
 */
function validateEntryName(name: string): void {
  const reject = (): never => {
    throw new SkillBundleError('Unsafe entry name: ' + name, 'UNSAFE_ENTRY_NAME');
  };
  if (name.includes('\0')) reject();
  if (name.startsWith('/') || name.startsWith('\\')) reject();
  if (/^[A-Za-z]:/.test(name)) reject();
  for (const segment of name.split(/[\\/]/)) {
    if (segment === '..' || segment === '.') reject();
  }
}

function locateEocd(buf: Uint8Array): number {
  for (let i = buf.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (dv(buf).getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new SkillBundleError(
    'Failed to parse ZIP: end-of-central-directory not found',
    'INVALID_ZIP'
  );
}

function hasZip64Extra(extra: Uint8Array): boolean {
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = dv(extra).getUint16(p, true);
    const size = dv(extra).getUint16(p + 2, true);
    if (id === ZIP64_EXTRA_SIG) return true;
    p += 4 + size;
  }
  return false;
}

interface ParsedEntry {
  name: string;
  localBlock: Uint8Array;
  centralHeader: Uint8Array;
}

function localBlockLength(buf: Uint8Array, localOffset: number): number {
  if (dv(buf).getUint32(localOffset, true) !== LFH_SIG) {
    throw new SkillBundleError(
      'Failed to parse ZIP: bad local file header',
      'INVALID_ZIP'
    );
  }
  const view = dv(buf);
  const compSize = view.getUint32(localOffset + 18, true);
  const nameLen = view.getUint16(localOffset + 26, true);
  const extraLen = view.getUint16(localOffset + 28, true);
  return LFH_FIXED_SIZE + nameLen + extraLen + compSize;
}

interface CdhFields {
  gpFlag: number;
  compSize: number;
  nameLen: number;
  extraLen: number;
  commentLen: number;
  localOffset: number;
  name: string;
}

function readCdhFields(buf: Uint8Array, cdPos: number): CdhFields {
  const view = dv(buf);
  if (view.getUint32(cdPos, true) !== CDH_SIG) {
    throw new SkillBundleError(
      'Failed to parse ZIP: bad central-directory header',
      'INVALID_ZIP'
    );
  }
  const nameLen = view.getUint16(cdPos + 28, true);
  const nameStart = cdPos + CDH_FIXED_SIZE;
  return {
    gpFlag: view.getUint16(cdPos + 8, true),
    compSize: view.getUint32(cdPos + 20, true),
    nameLen,
    extraLen: view.getUint16(cdPos + 30, true),
    commentLen: view.getUint16(cdPos + 32, true),
    localOffset: view.getUint32(cdPos + 42, true),
    name: new TextDecoder().decode(buf.subarray(nameStart, nameStart + nameLen)),
  };
}

function assertEntrySupported(fields: CdhFields, extra: Uint8Array): void {
  if ((fields.gpFlag & GP_ENCRYPTED_BIT) !== 0) {
    throw new SkillBundleError('Encrypted entries are not supported', 'UNSUPPORTED_FLAG');
  }
  if (
    fields.compSize === 0xffffffff ||
    fields.localOffset === 0xffffffff ||
    hasZip64Extra(extra)
  ) {
    throw new SkillBundleError('ZIP64 entries are not supported', 'UNSUPPORTED_FLAG');
  }
}

function parseEntry(
  buf: Uint8Array,
  cdPos: number
): { entry: ParsedEntry; next: number } {
  const fields = readCdhFields(buf, cdPos);
  validateEntryName(fields.name);
  const extraStart = cdPos + CDH_FIXED_SIZE + fields.nameLen;
  const extra = buf.subarray(extraStart, extraStart + fields.extraLen);
  assertEntrySupported(fields, extra);
  const cdEnd = extraStart + fields.extraLen + fields.commentLen;
  const localBlock = buf.subarray(
    fields.localOffset,
    fields.localOffset + localBlockLength(buf, fields.localOffset)
  );
  return {
    entry: { name: fields.name, localBlock, centralHeader: buf.subarray(cdPos, cdEnd) },
    next: cdEnd,
  };
}

function parseEntries(buf: Uint8Array): ParsedEntry[] {
  const view = dv(buf);
  const eocd = locateEocd(buf);
  const count = view.getUint16(eocd + 10, true);
  let cdPos = view.getUint32(eocd + 16, true);
  const entries: ParsedEntry[] = [];
  for (let i = 0; i < count; i++) {
    const { entry, next } = parseEntry(buf, cdPos);
    entries.push(entry);
    cdPos = next;
  }
  return entries;
}

function decodeSkillMd(buf: Uint8Array, present: boolean): string | undefined {
  if (!present) return undefined;
  try {
    const unzipped = unzipSync(buf, {
      filter: (f): boolean => f.name === SKILL_MD_NAME,
    });
    const data = unzipped[SKILL_MD_NAME];
    return data === undefined ? undefined : new TextDecoder().decode(data);
  } catch (e) {
    throw new SkillBundleError(
      'Failed to parse ZIP: ' + (e as Error).message,
      'INVALID_ZIP'
    );
  }
}

export async function readSkillBundle(uri: {
  fsPath: string;
}): Promise<SkillBundleContent> {
  const buf = new Uint8Array(await readFile(uri.fsPath));
  const entries = parseEntries(buf);
  const companions = entries.filter((e) => e.name !== SKILL_MD_NAME);
  const hasSkillMd = entries.some((e) => e.name === SKILL_MD_NAME);
  return { skillMd: decodeSkillMd(buf, hasSkillMd), companions };
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) {
    const entry = CRC_TABLE[(c ^ byte) & 0xff] ?? 0;
    c = entry ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildSkillMdLocal(name: Uint8Array, data: Uint8Array, crc: number): Uint8Array {
  const local = new Uint8Array(LFH_FIXED_SIZE + name.length + data.length);
  const lv = dv(local);
  lv.setUint32(0, LFH_SIG, true);
  lv.setUint16(4, 20, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, name.length, true);
  local.set(name, LFH_FIXED_SIZE);
  local.set(data, LFH_FIXED_SIZE + name.length);
  return local;
}

interface CentralParams {
  name: Uint8Array;
  dataLen: number;
  crc: number;
  offset: number;
}

function buildSkillMdCentral(p: CentralParams): Uint8Array {
  const central = new Uint8Array(CDH_FIXED_SIZE + p.name.length);
  const cv = dv(central);
  cv.setUint32(0, CDH_SIG, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint32(16, p.crc, true);
  cv.setUint32(20, p.dataLen, true);
  cv.setUint32(24, p.dataLen, true);
  cv.setUint16(28, p.name.length, true);
  cv.setUint32(42, p.offset, true);
  central.set(p.name, CDH_FIXED_SIZE);
  return central;
}

function buildSkillMdBlocks(
  content: string,
  offset: number
): { local: Uint8Array; central: Uint8Array } {
  const name = new TextEncoder().encode(SKILL_MD_NAME);
  const data = new TextEncoder().encode(content);
  const crc = crc32(data);
  return {
    local: buildSkillMdLocal(name, data, crc),
    central: buildSkillMdCentral({ name, dataLen: data.length, crc, offset }),
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function patchedCentralHeader(entry: CompanionEntry, offset: number): Uint8Array {
  const copy = entry.centralHeader.slice();
  dv(copy).setUint32(42, offset, true);
  return copy;
}

function buildEocd(count: number, cdOffset: number, cdSize: number): Uint8Array {
  const eocd = new Uint8Array(EOCD_MIN_SIZE);
  const v = dv(eocd);
  v.setUint32(0, EOCD_SIG, true);
  v.setUint16(8, count, true);
  v.setUint16(10, count, true);
  v.setUint32(12, cdSize, true);
  v.setUint32(16, cdOffset, true);
  return eocd;
}

export async function writeSkillBundle(
  uri: { fsPath: string },
  content: SkillBundleContent
): Promise<void> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const companion of content.companions) {
    centrals.push(patchedCentralHeader(companion, offset));
    locals.push(companion.localBlock);
    offset += companion.localBlock.length;
  }
  const skill = buildSkillMdBlocks(content.skillMd ?? '', offset);
  locals.push(skill.local);
  centrals.push(skill.central);
  const localSection = concat(locals);
  const centralSection = concat(centrals);
  const eocd = buildEocd(
    content.companions.length + 1,
    localSection.length,
    centralSection.length
  );
  await writeFile(uri.fsPath, concat([localSection, centralSection, eocd]));
}
