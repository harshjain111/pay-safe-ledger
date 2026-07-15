// ============================================================================
// Indian states / UTs (with GST state codes) + GSTIN validation.
//
// A GSTIN is 15 chars: [2 state code][10 PAN][1 entity][Z][1 checksum].
// Validating one properly means three things, not just a regex:
//   1. format         — the 15-char shape
//   2. checksum        — the 15th char is a mod-36 check digit over the first 14
//   3. state code      — the leading 2 digits are a real state, and (if the user
//                        picked a State) they must agree with it
// ============================================================================

export interface IndianState {
  /** GST state code, e.g. '27' for Maharashtra. */
  code: string;
  name: string;
}

/** Current 28 states + 8 UTs, alphabetical by name, with their GST codes. */
export const INDIAN_STATES: IndianState[] = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
];

const STATE_CODE_BY_NAME = new Map(INDIAN_STATES.map((s) => [s.name.toLowerCase(), s.code]));

/** GST state code for a state name (case-insensitive), or null if unknown. */
export function stateCodeForName(name: string | null | undefined): string | null {
  if (!name) return null;
  return STATE_CODE_BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/** Every GST state code that may legitimately lead a GSTIN (incl. historical
 *  25/28 and the special 97 "Other Territory" / 99 "Centre" so old numbers
 *  aren't rejected). */
const VALID_STATE_CODES = new Set<string>([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), // 01..38
  '97',
  '99',
]);

export const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

const GSTN_CODEPOINTS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The official GSTN check digit for the first 14 characters — a Luhn-style
 * mod-36 algorithm. The 15th character of a valid GSTIN equals this.
 */
export function gstinCheckDigit(first14: string): string {
  const mod = GSTN_CODEPOINTS.length; // 36
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const codePoint = GSTN_CODEPOINTS.indexOf(first14[i]);
    let digit = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    digit = Math.floor(digit / mod) + (digit % mod);
    sum += digit;
  }
  const check = (mod - (sum % mod)) % mod;
  return GSTN_CODEPOINTS[check];
}

/** True if `raw` is a structurally valid GSTIN (format + checksum). */
export function isValidGstin(raw: string): boolean {
  const g = (raw || '').trim().toUpperCase();
  return GSTIN_FORMAT.test(g) && gstinCheckDigit(g.slice(0, 14)) === g[14];
}

/**
 * Validate a GSTIN for the org form. Returns a human message on failure, or
 * null when it's acceptable (including when empty — the field is optional).
 * When `stateName` is given, the GSTIN's state code must match it.
 */
export function validateGstin(raw: string, stateName?: string | null): string | null {
  const g = (raw || '').trim().toUpperCase();
  if (!g) return null; // optional
  if (!GSTIN_FORMAT.test(g)) return 'Enter a valid 15-character GSTIN (e.g. 27AAPFU0939F1ZV)';
  if (gstinCheckDigit(g.slice(0, 14)) !== g[14]) {
    return 'GSTIN checksum is invalid — please re-check the number';
  }
  const code = g.slice(0, 2);
  if (!VALID_STATE_CODES.has(code)) return `"${code}" is not a valid GST state code`;
  const expected = stateCodeForName(stateName);
  if (expected && expected !== code) {
    return `GSTIN state code (${code}) doesn't match the selected State (${stateName} → ${expected})`;
  }
  return null;
}
