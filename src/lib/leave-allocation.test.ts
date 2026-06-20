import { describe, it, expect } from 'vitest';
import {
  applyAutoAllocation, allocatesOn, applyPeriodEnd,
  validateEmployeeSelection, validateHolidayTemplateExists, validateBalanceAdjustment,
  validateLeaveTypeForm, planAssignments, expandHolidayDays, mergeTemplateHolidays,
  type LeaveTypeConfig,
} from './leave-allocation';

const type = (over: Partial<LeaveTypeConfig> = {}): LeaveTypeConfig => ({
  no_of_auto_allocation_leaves: 2,
  auto_allocation_period: 'MONTH',
  carry_forward_leaves: 1,
  carry_forward_period: 'MONTH',
  encashment_enabled: false,
  encashment_limit: null,
  encashment_period: null,
  ...over,
});

describe('auto-allocation', () => {
  it('credits the configured qty', () => {
    expect(applyAutoAllocation(3, { no_of_auto_allocation_leaves: 2 })).toBe(5);
  });
  it('treats negative/garbage config as 0', () => {
    expect(applyAutoAllocation(3, { no_of_auto_allocation_leaves: -5 })).toBe(3);
    expect(applyAutoAllocation(3, { no_of_auto_allocation_leaves: NaN as unknown as number })).toBe(3);
  });
  it('MONTH types fire every month and at year-end; YEAR types fire only on the year boundary', () => {
    expect(allocatesOn('MONTH', 'MONTH')).toBe(true);
    expect(allocatesOn('MONTH', 'YEAR')).toBe(true);
    expect(allocatesOn('YEAR', 'MONTH')).toBe(false);
    expect(allocatesOn('YEAR', 'YEAR')).toBe(true);
  });
});

describe('carry-forward cap + encashment', () => {
  it('caps the carried balance and forfeits the excess (no encashment)', () => {
    const r = applyPeriodEnd(10, type({ carry_forward_leaves: 3 }));
    expect(r).toEqual({ carried: 3, encashed: 0, forfeited: 7 });
  });

  it('carries everything when the balance is within the cap', () => {
    const r = applyPeriodEnd(2, type({ carry_forward_leaves: 3 }));
    expect(r).toEqual({ carried: 2, encashed: 0, forfeited: 0 });
  });

  it('pays out the excess above the encashment limit instead of forfeiting it', () => {
    // balance 10, carry cap 3 -> 7 leftover; encash above limit 5 -> 5 paid, 2 forfeited
    const r = applyPeriodEnd(10, type({ carry_forward_leaves: 3, encashment_enabled: true, encashment_limit: 5 }));
    expect(r).toEqual({ carried: 3, encashed: 5, forfeited: 2 });
  });

  it('encashes nothing when the balance is below the encashment limit', () => {
    const r = applyPeriodEnd(10, type({ carry_forward_leaves: 3, encashment_enabled: true, encashment_limit: 12 }));
    expect(r).toEqual({ carried: 3, encashed: 0, forfeited: 7 });
  });

  it('encash is clamped to the leftover (cannot pay out what was carried)', () => {
    // limit 0 would encash the whole balance, but only the 7 leftover is available
    const r = applyPeriodEnd(10, type({ carry_forward_leaves: 3, encashment_enabled: true, encashment_limit: 0 }));
    expect(r).toEqual({ carried: 3, encashed: 7, forfeited: 0 });
  });
});

describe('validation guards (exact spec messages)', () => {
  it('bulk assign requires at least one employee', () => {
    expect(validateEmployeeSelection([])).toBe('Please select at least one employee.');
    expect(validateEmployeeSelection(['s1'])).toBeNull();
  });
  it('holiday assign is blocked until a template exists', () => {
    expect(validateHolidayTemplateExists(0)).toBe('Please create a holiday template first.');
    expect(validateHolidayTemplateExists(2)).toBeNull();
  });
  it('bulk adjust requires a leave type and mandatory remarks', () => {
    expect(validateBalanceAdjustment({ leaveId: '', comment: 'x' })).toMatch(/leave type/i);
    expect(validateBalanceAdjustment({ leaveId: 'l1', comment: '   ' })).toBe('Remarks are required.');
    expect(validateBalanceAdjustment({ leaveId: 'l1', comment: 'correction' })).toBeNull();
  });
  it('leave-type form requires encashment fields only when enabled', () => {
    expect(validateLeaveTypeForm({ name: '', code: 'L1' })).toMatch(/Leave Name/);
    expect(validateLeaveTypeForm({ name: 'Regular', code: '' })).toMatch(/Alias/);
    expect(validateLeaveTypeForm({ name: 'Regular', code: 'L1', encashment_enabled: false })).toBeNull();
    expect(validateLeaveTypeForm({ name: 'Regular', code: 'L1', encashment_enabled: true, encashment_limit: null }))
      .toMatch(/Encashment Limit/);
    expect(validateLeaveTypeForm({ name: 'Regular', code: 'L1', encashment_enabled: true, encashment_limit: 5, encashment_period: null }))
      .toMatch(/Encashment period/);
    expect(validateLeaveTypeForm({ name: 'Regular', code: 'L1', encashment_enabled: true, encashment_limit: 5, encashment_period: 'YEAR' }))
      .toBeNull();
  });
});

describe('idempotent assignment plan', () => {
  it('creates only the new (staff,type) pairs, never duplicating an existing link', () => {
    const plan = planAssignments(
      ['s1', 's2'],
      ['t1', 't2'],
      [{ staff_id: 's1', leave_type_id: 't1' }], // already assigned
    );
    expect(plan).toEqual([
      { staff_id: 's1', leave_type_id: 't2' },
      { staff_id: 's2', leave_type_id: 't1' },
      { staff_id: 's2', leave_type_id: 't2' },
    ]);
  });
  it('re-assigning an already-assigned set is a no-op', () => {
    expect(planAssignments(['s1'], ['t1'], [{ staff_id: 's1', leave_type_id: 't1' }])).toEqual([]);
  });
});

describe('multi-day holiday expansion', () => {
  it('expands a single day', () => {
    const out = expandHolidayDays([{ start_date: '2026-06-15', end_date: '2026-06-15' }], '2026-06-01', '2026-06-30');
    expect([...out]).toEqual(['2026-06-15']);
  });
  it('expands a multi-day range to one entry per day', () => {
    const out = expandHolidayDays([{ start_date: '2026-06-14', end_date: '2026-06-16' }], '2026-06-01', '2026-06-30');
    expect([...out].sort()).toEqual(['2026-06-14', '2026-06-15', '2026-06-16']);
  });
  it('drops days outside the [from,to] window', () => {
    const out = expandHolidayDays([{ start_date: '2026-05-30', end_date: '2026-06-02' }], '2026-06-01', '2026-06-30');
    expect([...out].sort()).toEqual(['2026-06-01', '2026-06-02']);
  });
});

describe('mergeTemplateHolidays (engine paid-day union)', () => {
  it('unions expanded template ranges with the base holiday set', () => {
    const base = new Set(['2026-06-01']);
    const merged = mergeTemplateHolidays(base, [{ start_date: '2026-06-10', end_date: '2026-06-11' }], '2026-06-01', '2026-06-30');
    expect([...merged].sort()).toEqual(['2026-06-01', '2026-06-10', '2026-06-11']);
  });
  it('does not mutate the base set', () => {
    const base = new Set(['2026-06-01']);
    mergeTemplateHolidays(base, [{ start_date: '2026-06-10', end_date: '2026-06-10' }], '2026-06-01', '2026-06-30');
    expect([...base]).toEqual(['2026-06-01']);
  });
});
