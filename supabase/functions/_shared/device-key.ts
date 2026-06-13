// ============================================================================
// Device API key helpers (Deno / Web Crypto).
//
// A device's plaintext API key is shown exactly once, at provisioning time.
// Only its SHA-256 hash is stored (biometric_devices.api_key_hash). On ingest,
// the incoming key is hashed the same way and compared. Keys are high-entropy
// random, so a bare SHA-256 (no salt) is sufficient and lets us look the device
// up by hash in a single indexed query.
// ============================================================================

const KEY_PREFIX = "dvk_";

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** Generate a new device API key, e.g. "dvk_<48 hex chars>". */
export function generateDeviceKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return KEY_PREFIX + toHex(bytes);
}

/** SHA-256 hex digest of a string. Used for both storing and verifying keys. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

/** Short, non-secret prefix kept for display (e.g. "dvk_ab12cd34"). */
export function keyDisplayPrefix(key: string): string {
  return key.slice(0, 12);
}
