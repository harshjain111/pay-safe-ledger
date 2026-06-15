import { describe, it, expect } from 'vitest';
import { computeSettlement, type SettlementInputs, type StatutorySettings } from './settlement-engine';
import type { DayBreakdown } from './attendance-pay';
import type { Staff } from '@/types/database';

const ALL_OFF: StatutorySettings = {
  pf_enabled: false, pf_employee_rate: 0, pf_employer_rate: 0, pf_base_cap: 0,
  esi_enabled: false, esi_employer_rate: 0, esi_eligibility_ceiling: 0,
  pt_enabled: false, pt_monthly_amount: 0, pt_min_gross: 0,
};

function makeStaff(over: Partial<Staff> = {}): Staff {
  return {
    id: 's1', full_name: 'Asha', employee_id: 'E1',
    date_of_joining: '2025-01-01', date_of_leaving: null, is_active: true,
    updated_at: '2026-01-01T00:00:00Z',
    monthly_salary: 30000, basic_salary: 30000, hra: 0, other_allowances: 0,
    pf_enrolled: false, esi_enrolled: false, attendance_tracked: false,
    ...over,
  } as unknown as Staff;
}

function inputs(over: Partial<SettlementInputs> = {}): SettlementInputs {
  return {
    staff: makeStaff(),
    month: '2026-06', // 30 days
    monthlySalary: 30000,
    advancesOutstanding: 0,
    statutory: ALL_OFF,
    dayBreakdown: null,
    attendanceTracked: false,
    compOffEnabled: true,
    disciplineFine: 0,
    systemDeductionDays: 0,
    overtimeAuto: 0,
    loanEmis: [],
    arrearsTotal: 0,
    ...over,
  };
}

const bd = (over: Partial<DayBreakdown> = {}): DayBreakdown => ({
  presentFull: 25, presentHalf: 0, paidLeaveDays: 0, offDays: 4, offWorkedDays: 0,
  absentDays: 0, absentDeductionDays: 0, presentEquiv: 25, windowDays: 30, workingDays: 26, days: [],
  ...over,
});

describe('computeSettlement', () => {
  it('full month, no deductions = full salary', () => {
    const r = computeSettlement(inputs());
    expect(r.effectiveDays).toBe(30);
    expect(r.monthlySalary).toBe(30000); // pro-rata
    expect(r.grossSalary).toBe(30000);
    expect(r.netPayable).toBe(30000);
    expect(r.pfEmployee).toBe(0);
  });

  it('mid-month join prorates by days worked', () => {
    const r = computeSettlement(inputs({ staff: makeStaff({ date_of_joining: '2026-06-16' }) }));
    expect(r.effectiveDays).toBe(15); // 30 - 16 + 1
    expect(r.monthlySalary).toBe(15000);
    expect(r.netPayable).toBe(15000);
  });

  it('applies PF (capped base) and reduces net', () => {
    const stat: StatutorySettings = { ...ALL_OFF, pf_enabled: true, pf_employee_rate: 12, pf_employer_rate: 12, pf_base_cap: 15000 };
    const r = computeSettlement(inputs({ statutory: stat, staff: makeStaff({ pf_enrolled: true }) }));
    expect(r.pfBase).toBe(15000); // min(30000, cap 15000)
    expect(r.pfEmployee).toBe(1800); // 12% of 15000
    expect(r.grossSalary).toBe(28200); // 30000 - 1800
    expect(r.netPayable).toBe(28200);
  });

  it('group policy can override PF enrolment (statutory default applies to members)', () => {
    const stat: StatutorySettings = { ...ALL_OFF, pf_enabled: true, pf_employee_rate: 12, pf_employer_rate: 12, pf_base_cap: 15000 };
    const r = computeSettlement(inputs({ statutory: stat, staff: makeStaff({ pf_enrolled: true }) }), { pfEnrolledOverride: false });
    expect(r.pfEmployee).toBe(0);
    expect(r.netPayable).toBe(30000);
  });

  it('docks leave + absent deductions', () => {
    const r = computeSettlement(inputs({
      systemDeductionDays: 2,
      dayBreakdown: bd({ absentDeductionDays: 1, absentDays: 1, presentFull: 24, workingDays: 26 }),
      attendanceTracked: true,
    }));
    expect(r.leaveDeduction).toBe(2000); // 1000/day × 2
    expect(r.absentDeduction).toBe(1000); // 1000/day × 1
    expect(r.grossSalary).toBe(27000);
    expect(r.netPayable).toBe(27000);
  });

  it('adjusts advances against net and carries the rest forward', () => {
    const r = computeSettlement(inputs({ advancesOutstanding: 5000 }), { advanceToAdjust: 3000 });
    expect(r.advanceToAdjust).toBe(3000);
    expect(r.netPayable).toBe(27000); // 30000 - 3000
    expect(r.carryForwardAdvance).toBe(2000); // 5000 - 3000
  });

  it('folds positive arrears (back-pay) into net pay as a distinct line', () => {
    const r = computeSettlement(inputs({ arrearsTotal: 5000 }));
    expect(r.arrears).toBe(5000);
    expect(r.netPayable).toBe(35000); // 30000 + 5000
  });

  it('a recovery (negative arrears) reduces net pay', () => {
    const r = computeSettlement(inputs({ arrearsTotal: -4000 }));
    expect(r.arrears).toBe(-4000);
    expect(r.netPayable).toBe(26000); // 30000 - 4000
  });

  it('rounding policy rounds the net payable', () => {
    // contrive a fractional net via PT-free fractional salary
    const r = computeSettlement(inputs({ monthlySalary: 30000.4 }), { rounding: 'nearest' });
    expect(Number.isInteger(r.netPayable)).toBe(true);
  });
});
