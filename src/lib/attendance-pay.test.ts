import { describe, it, expect } from 'vitest';
import { computeDayBreakdown } from './attendance-pay';

// June 2026: Jun 1 = Monday; Sundays fall on the 7th, 14th, 21st, 28th.
const base = {
  monthStart: new Date(2026, 5, 1),
  monthEnd: new Date(2026, 5, 30),
  fullDayMinutes: 480,
  halfDayMinutes: 240,
  unscheduledIsOff: true,
  weeklyOffDay: null as number | null,
};

describe('computeDayBreakdown', () => {
  it('classifies a mixed 6-day window (unscheduledIsOff=true)', () => {
    const bd = computeDayBreakdown({
      ...base,
      dateOfJoining: '2026-06-25',
      dateOfLeaving: null,
      attendance: [
        { work_date: '2026-06-25', worked_minutes: 480, status: 'completed' }, // full present
        { work_date: '2026-06-26', worked_minutes: 300, status: 'completed' }, // half present
        { work_date: '2026-06-28', worked_minutes: 500, status: 'completed' }, // off-day worked
        { work_date: '2026-06-30', worked_minutes: 200, status: 'completed' }, // < half -> absent
      ],
      roster: [
        { roster_date: '2026-06-25', shift_id: 's1', is_off: false },
        { roster_date: '2026-06-26', shift_id: 's1', is_off: false },
        { roster_date: '2026-06-27', shift_id: null, is_off: true }, // explicit off
        // 2026-06-28: no roster row -> unscheduled -> off
        { roster_date: '2026-06-29', shift_id: 's1', is_off: false },
        { roster_date: '2026-06-30', shift_id: 's1', is_off: false },
      ],
      leaves: [],
    });
    expect(bd.windowDays).toBe(6);
    expect(bd.presentFull).toBe(2); // 25 + 28(off-worked)
    expect(bd.presentHalf).toBe(1); // 26
    expect(bd.offDays).toBe(1); // 27 (off, not worked)
    expect(bd.offWorkedDays).toBe(1); // 28
    expect(bd.absentDays).toBe(2); // 29 (no att) + 30 (<half)
    expect(bd.absentDeductionDays).toBeCloseTo(2.5); // 0.5(26) + 1(29) + 1(30)
    expect(bd.paidLeaveDays).toBe(0);
    expect(bd.presentEquiv).toBeCloseTo(2.5);
    expect(bd.workingDays).toBe(4); // 25,26,29,30
  });

  it('unscheduledIsOff=false treats unrostered non-weekly-off days as working (absent if no attendance)', () => {
    const bd = computeDayBreakdown({
      ...base,
      unscheduledIsOff: false,
      monthStart: new Date(2026, 5, 29),
      monthEnd: new Date(2026, 5, 30),
      dateOfJoining: '2026-06-01',
      dateOfLeaving: null,
      attendance: [],
      roster: [],
      leaves: [],
    });
    expect(bd.windowDays).toBe(2);
    expect(bd.workingDays).toBe(2);
    expect(bd.absentDays).toBe(2);
    expect(bd.absentDeductionDays).toBe(2);
    expect(bd.offDays).toBe(0);
  });

  it('weekly-off day is a paid off (no absence) when unscheduledIsOff=false', () => {
    const bd = computeDayBreakdown({
      ...base,
      unscheduledIsOff: false,
      weeklyOffDay: 0, // Sunday
      monthStart: new Date(2026, 5, 28), // a Sunday
      monthEnd: new Date(2026, 5, 28),
      dateOfJoining: '2026-06-01',
      dateOfLeaving: null,
      attendance: [],
      roster: [],
      leaves: [],
    });
    expect(bd.offDays).toBe(1);
    expect(bd.absentDays).toBe(0);
    expect(bd.absentDeductionDays).toBe(0);
  });

  it('paid leave (deduction 0) pays; unpaid leave (deduction 1) does not; neither is an absence', () => {
    const bd = computeDayBreakdown({
      ...base,
      monthStart: new Date(2026, 5, 1),
      monthEnd: new Date(2026, 5, 2),
      dateOfJoining: '2026-06-01',
      dateOfLeaving: null,
      attendance: [],
      roster: [
        { roster_date: '2026-06-01', shift_id: 's1', is_off: false },
        { roster_date: '2026-06-02', shift_id: 's1', is_off: false },
      ],
      leaves: [
        { leave_date: '2026-06-01', deduction_days: 0 }, // paid leave
        { leave_date: '2026-06-02', deduction_days: 1 }, // unpaid leave
      ],
    });
    expect(bd.paidLeaveDays).toBe(1); // (1-0) + (1-1)
    expect(bd.absentDays).toBe(0);
    expect(bd.absentDeductionDays).toBe(0);
  });

  it('honours the employment window (leaving mid-window)', () => {
    const bd = computeDayBreakdown({
      ...base,
      dateOfJoining: '2026-06-01',
      dateOfLeaving: '2026-06-03',
      attendance: [],
      roster: [
        { roster_date: '2026-06-01', shift_id: 's1', is_off: false },
        { roster_date: '2026-06-02', shift_id: 's1', is_off: false },
        { roster_date: '2026-06-03', shift_id: 's1', is_off: false },
      ],
      leaves: [],
    });
    expect(bd.windowDays).toBe(3); // Jun 1..3 only
  });

  it('is safe on fully empty inputs', () => {
    const bd = computeDayBreakdown({
      ...base,
      unscheduledIsOff: true,
      dateOfJoining: '2026-06-01',
      dateOfLeaving: null,
      attendance: [],
      roster: [],
      leaves: [],
    });
    // unscheduledIsOff -> every day off, nothing absent
    expect(bd.windowDays).toBe(30);
    expect(bd.offDays).toBe(30);
    expect(bd.absentDays).toBe(0);
    expect(bd.absentDeductionDays).toBe(0);
  });

  it('does not double-dock a half day that already carries a discipline fine', () => {
    const common = {
      ...base,
      monthStart: new Date(2026, 5, 1),
      monthEnd: new Date(2026, 5, 1),
      dateOfJoining: '2026-06-01',
      dateOfLeaving: null,
      attendance: [{ work_date: '2026-06-01', worked_minutes: 300, status: 'completed' }],
      roster: [{ roster_date: '2026-06-01', shift_id: 's1', is_off: false }],
      leaves: [],
    };
    expect(computeDayBreakdown(common).absentDeductionDays).toBe(0.5);
    const withFine = computeDayBreakdown({ ...common, disciplineFinedDates: new Set(['2026-06-01']) });
    expect(withFine.absentDeductionDays).toBe(0); // the discipline fine owns the dock
    expect(withFine.presentHalf).toBe(1);
  });

  it('sums multiple completed sessions on one day', () => {
    const bd = computeDayBreakdown({
      ...base,
      monthStart: new Date(2026, 5, 1),
      monthEnd: new Date(2026, 5, 1),
      dateOfJoining: '2026-06-01',
      dateOfLeaving: null,
      attendance: [
        { work_date: '2026-06-01', worked_minutes: 240, status: 'completed' },
        { work_date: '2026-06-01', worked_minutes: 240, status: 'completed' }, // 240+240 = full day
      ],
      roster: [{ roster_date: '2026-06-01', shift_id: 's1', is_off: false }],
      leaves: [],
    });
    expect(bd.presentFull).toBe(1);
    expect(bd.presentHalf).toBe(0);
    expect(bd.absentDeductionDays).toBe(0);
  });

  it('ignores open (active/on_break) sessions — a scheduled day with only an open session is absent', () => {
    const bd = computeDayBreakdown({
      ...base,
      monthStart: new Date(2026, 5, 1),
      monthEnd: new Date(2026, 5, 1),
      dateOfJoining: '2026-06-01',
      dateOfLeaving: null,
      attendance: [{ work_date: '2026-06-01', worked_minutes: null, status: 'active' }],
      roster: [{ roster_date: '2026-06-01', shift_id: 's1', is_off: false }],
      leaves: [],
    });
    expect(bd.presentFull).toBe(0);
    expect(bd.presentHalf).toBe(0);
    expect(bd.absentDays).toBe(1);
    expect(bd.absentDeductionDays).toBe(1);
  });
});
