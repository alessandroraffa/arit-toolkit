/**
 * Computes a numeric version code from a semantic version string.
 *
 * Format: 1XXXYYYZZZ where XXX = major, YYY = minor, ZZZ = patch
 * (each segment zero-padded to 3 digits, prefixed with 1).
 *
 * @example computeVersionCode("1.1.2")  // → 1001001002
 * @example computeVersionCode("2.10.5") // → 1002010005
 */
export function computeVersionCode(version: string): number {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: "${version}" (expected "X.Y.Z")`);
  }

  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);

  if ([major, minor, patch].some((n) => isNaN(n) || n < 0 || n > 999)) {
    throw new Error(`Invalid version segments in "${version}" (each must be 0–999)`);
  }

  return 1_000_000_000 + major * 1_000_000 + minor * 1_000 + patch;
}
