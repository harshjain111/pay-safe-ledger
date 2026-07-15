import { describe, it, expect } from 'vitest';
import {
  gstinCheckDigit,
  isValidGstin,
  validateGstin,
  stateCodeForName,
  INDIAN_STATES,
} from './gstin';

describe('gstinCheckDigit', () => {
  it('computes the GSTN check digit for the canonical example', () => {
    // 27AAPFU0939F1ZV is the GSTN documentation example; check digit is V.
    expect(gstinCheckDigit('27AAPFU0939F1Z')).toBe('V');
  });
});

describe('isValidGstin', () => {
  it('accepts a valid GSTIN', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27aapfu0939f1zv')).toBe(true); // case-insensitive
  });

  it('rejects a wrong checksum (last char tampered)', () => {
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false);
  });

  it('rejects a wrong format', () => {
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false); // 14 chars
    expect(isValidGstin('ABCDE1234567890')).toBe(false);
    expect(isValidGstin('')).toBe(false);
  });
});

describe('validateGstin', () => {
  it('treats empty as acceptable (optional field)', () => {
    expect(validateGstin('')).toBeNull();
    expect(validateGstin('   ')).toBeNull();
  });

  it('returns a message for a bad checksum', () => {
    expect(validateGstin('27AAPFU0939F1ZX')).toMatch(/checksum/i);
  });

  it('passes when the GSTIN state code matches the selected state', () => {
    expect(validateGstin('27AAPFU0939F1ZV', 'Maharashtra')).toBeNull();
  });

  it('flags a mismatch between GSTIN state code and selected state', () => {
    expect(validateGstin('27AAPFU0939F1ZV', 'Karnataka')).toMatch(/doesn't match/i);
  });
});

describe('state list', () => {
  it('maps names to codes', () => {
    expect(stateCodeForName('Maharashtra')).toBe('27');
    expect(stateCodeForName('karnataka')).toBe('29');
    expect(stateCodeForName('Nowhere')).toBeNull();
  });

  it('has 36 unique states/UTs with unique codes', () => {
    expect(INDIAN_STATES).toHaveLength(36);
    expect(new Set(INDIAN_STATES.map((s) => s.code)).size).toBe(36);
  });
});
