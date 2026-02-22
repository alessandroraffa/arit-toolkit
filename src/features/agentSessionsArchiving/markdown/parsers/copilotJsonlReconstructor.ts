/**
 * Reconstructs a Copilot Chat session object from JSONL delta format.
 *
 * JSONL lines use three operation kinds:
 * - kind 0: Initialize — `v` contains the full session snapshot
 * - kind 1: Set — replace value at key path `k` with `v`
 * - kind 2: Append — append items in `v` to the array at key path `k`
 */

interface JsonlDelta {
  kind: number;
  k?: (string | number)[];
  v?: unknown;
}

/** Navigate to the parent of the last key in the path. */
function resolveParent(
  root: Record<string, unknown>,
  keys: readonly (string | number)[]
): { parent: Record<string, unknown> | unknown[]; lastKey: string | number } | undefined {
  const lastKey = keys[keys.length - 1];
  if (lastKey === undefined) return undefined;

  let current: unknown = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key === undefined || current === null || typeof current !== 'object')
      return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  if (current === null || typeof current !== 'object') return undefined;
  return { parent: current as Record<string, unknown>, lastKey };
}

function applySet(root: Record<string, unknown>, delta: JsonlDelta): void {
  if (!delta.k?.length) return;
  const resolved = resolveParent(root, delta.k);
  if (!resolved) return;
  (resolved.parent as Record<string | number, unknown>)[resolved.lastKey] = delta.v;
}

function applyAppend(root: Record<string, unknown>, delta: JsonlDelta): void {
  if (!delta.k?.length || !Array.isArray(delta.v)) return;
  const resolved = resolveParent(root, delta.k);
  if (!resolved) return;
  const target = (resolved.parent as Record<string | number, unknown>)[resolved.lastKey];
  if (Array.isArray(target)) {
    target.push(...(delta.v as unknown[]));
  }
}

function parseLine(line: string): JsonlDelta | undefined {
  try {
    return JSON.parse(line) as JsonlDelta;
  } catch {
    return undefined;
  }
}

function applyDelta(root: Record<string, unknown>, delta: JsonlDelta): void {
  if (delta.kind === 1) applySet(root, delta);
  if (delta.kind === 2) applyAppend(root, delta);
}

export function reconstructSessionFromJsonl(content: string): Record<string, unknown> {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return {};

  let root: Record<string, unknown> | undefined;

  for (const line of lines) {
    const delta = parseLine(line);
    if (!delta) continue;

    if (delta.kind === 0 && delta.v && typeof delta.v === 'object') {
      root = delta.v as Record<string, unknown>;
    } else if (root) {
      applyDelta(root, delta);
    }
  }

  return root ?? {};
}
