import { describe, it, expect } from 'vitest';
import { accruedForType } from './leave';

describe('accruedForType', () => {
  it('annual accrual grants the full quota regardless of date', () => {
    expect(accruedForType({ accrual: 'annual', default_quota: 12 }, 2026, new Date(2026, 0, 2))).toBe(12);
    expect(accruedForType({ accrual: 'annual', default_quota: 12 }, 2026, new Date(2026, 11, 31))).toBe(12);
  });

  it('monthly accrual prorates by months elapsed', () => {
    // June 2026 -> 6 months elapsed -> half of 12
    expect(accruedForType({ accrual: 'monthly', default_quota: 12 }, 2026, new Date(2026, 5, 15))).toBe(6);
    // January -> 1 month
    expect(accruedForType({ accrual: 'monthly', default_quota: 12 }, 2026, new Date(2026, 0, 1))).toBe(1);
  });

  it('monthly accrual is full for a past year and zero for a future year', () => {
    expect(accruedForType({ accrual: 'monthly', default_quota: 12 }, 2025, new Date(2026, 0, 1))).toBe(12);
    expect(accruedForType({ accrual: 'monthly', default_quota: 12 }, 2027, new Date(2026, 0, 1))).toBe(0);
  });

  it('none accrual grants nothing (e.g. unpaid types)', () => {
    expect(accruedForType({ accrual: 'none', default_quota: 99 }, 2026, new Date(2026, 5, 1))).toBe(0);
  });
});
