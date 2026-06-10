import { describe, it, expect } from 'vitest';
import { computeProfessionalTax, type PTSlab } from './payroll';
import { entitledForYear, computeBalance } from './leave';

const wbSlabs: PTSlab[] = [
  { upTo: 10000, amount: 0 },
  { upTo: 15000, amount: 110 },
  { upTo: 25000, amount: 130 },
  { upTo: 40000, amount: 150 },
  { upTo: null, amount: 200 },
];

describe('computeProfessionalTax — West Bengal slabs', () => {
  const cfg = { pt_enabled: true, pt_slabs: wbSlabs };
  it.each([
    [5000, 0],
    [10000, 0], // boundary (inclusive upper)
    [10001, 110],
    [15000, 110],
    [15001, 130],
    [25000, 130],
    [25001, 150],
    [40000, 150],
    [40001, 200],
    [99999, 200], // null upTo top slab
  ])('gross %d -> PT %d', (gross, pt) => {
    expect(computeProfessionalTax({}, gross, cfg)).toBe(pt);
  });

  it('returns 0 for a PT-exempt staff member', () => {
    expect(computeProfessionalTax({ pt_exempt: true }, 50000, cfg)).toBe(0);
  });

  it('returns 0 when PT is disabled', () => {
    expect(computeProfessionalTax({}, 50000, { pt_enabled: false, pt_slabs: wbSlabs })).toBe(0);
  });

  it('handles unsorted slabs correctly', () => {
    const shuffled: PTSlab[] = [
      { upTo: null, amount: 200 },
      { upTo: 15000, amount: 110 },
      { upTo: 10000, amount: 0 },
      { upTo: 40000, amount: 150 },
      { upTo: 25000, amount: 130 },
    ];
    expect(computeProfessionalTax({}, 20000, { pt_enabled: true, pt_slabs: shuffled })).toBe(130);
  });

  it('falls back to the flat amount when no slabs are configured', () => {
    const flat = { pt_enabled: true, pt_monthly_amount: 200, pt_min_gross: 15000, pt_slabs: [] };
    expect(computeProfessionalTax({}, 20000, flat)).toBe(200);
    expect(computeProfessionalTax({}, 10000, flat)).toBe(0); // below min gross
  });
});

describe('entitledForYear', () => {
  it('grants the full annual quota upfront', () => {
    expect(entitledForYear({ annual_quota: 12, accrual: 'annual' }, 2026, new Date(2026, 0, 15))).toBe(12);
  });
  it('prorates a monthly accrual by months elapsed in the current year', () => {
    // June = month index 5 -> 6 months elapsed -> 12/12 * 6 = 6
    expect(entitledForYear({ annual_quota: 12, accrual: 'monthly' }, 2026, new Date(2026, 5, 15))).toBe(6);
  });
  it('monthly accrual is full for past years and zero for future years', () => {
    expect(entitledForYear({ annual_quota: 12, accrual: 'monthly' }, 2025, new Date(2026, 0, 1))).toBe(12);
    expect(entitledForYear({ annual_quota: 12, accrual: 'monthly' }, 2027, new Date(2026, 0, 1))).toBe(0);
  });
});

describe('computeBalance', () => {
  it('remaining = entitled + compOff - taken', () => {
    const b = computeBalance(12, 3, 2);
    expect(b.remaining).toBe(11);
    expect(b.entitled).toBe(12);
    expect(b.taken).toBe(3);
    expect(b.compOff).toBe(2);
  });
  it('can carry a negative balance when over-taken', () => {
    expect(computeBalance(12, 15, 0).remaining).toBe(-3);
  });
});
