import { describe, it, expect } from 'vitest';
import { computePaidDays, honorificFor } from './payslip-format';

describe('honorificFor', () => {
  it('maps gender to the printed prefix', () => {
    expect(honorificFor('Male')).toBe('Mr. ');
    expect(honorificFor('female')).toBe('Ms. ');
    expect(honorificFor('Other')).toBe('');
    expect(honorificFor(null)).toBe('');
  });
});

describe('computePaidDays (client-confirmed calendar rule)', () => {
  it('caps at the days in the month — the sample-slip February case', () => {
    // PRESENT 27 + W.Off 4 in a 28-day February prints PAID 28.
    expect(computePaidDays({ daysInMonth: 28, presentDays: 27, halfDays: 0, paidLeaveDays: 0, offDays: 4 })).toBe(28);
  });
  it('sums present + half×0.5 + paid leave + offs when under the cap', () => {
    expect(computePaidDays({ daysInMonth: 31, presentDays: 20, halfDays: 2, paidLeaveDays: 1, offDays: 4 })).toBe(26);
  });
  it('week-offs follow the calendar (a 5-Monday month yields 5 offs)', () => {
    expect(computePaidDays({ daysInMonth: 30, presentDays: 25, halfDays: 0, paidLeaveDays: 0, offDays: 5 })).toBe(30);
  });
});
