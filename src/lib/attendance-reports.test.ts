import { describe, it, expect } from 'vitest';
import { computeDayBreakdown } from './attendance-pay';
import {
  buildReportDataset,
  musterRows,
  dailyPunchRows,
  workingHoursRows,
  shiftWiseRows,
  branchWiseRows,
  employeeDayWiseRows,
  shiftMinutes,
  type ReportStaff,
  type ReportSession,
  type ReportRoster,
  type ReportLeave,
  type ReportShift,
  type ReportShiftAssignment,
} from './attendance-reports';

// ---- a small, fully hand-computable fixture --------------------------------
const staff: ReportStaff[] = [
  {
    id: 's1', full_name: 'Asha', employee_id: 'E1', department: 'Ops', department_id: 'd1',
    designation: 'Server', outlet_id: 'o1', date_of_joining: '2025-01-01', date_of_leaving: null,
    weekly_off_day: null,
  },
];
const sessions: ReportSession[] = [
  { staff_id: 's1', work_date: '2026-06-01', worked_minutes: 600, status: 'completed', check_in_at: '2026-06-01T03:30:00Z', check_out_at: '2026-06-01T13:30:00Z', source: 'biometric' },
  { staff_id: 's1', work_date: '2026-06-02', worked_minutes: 300, status: 'completed', check_in_at: '2026-06-02T03:30:00Z', check_out_at: '2026-06-02T08:30:00Z', source: 'app' },
  { staff_id: 's1', work_date: '2026-06-03', worked_minutes: 120, status: 'completed', check_in_at: '2026-06-03T03:30:00Z', check_out_at: '2026-06-03T05:30:00Z', source: 'app' },
  { staff_id: 's1', work_date: '2026-06-07', worked_minutes: 480, status: 'completed', check_in_at: '2026-06-07T03:30:00Z', check_out_at: '2026-06-07T11:30:00Z', source: 'face' },
];
const roster: ReportRoster[] = [
  { staff_id: 's1', roster_date: '2026-06-06', shift_id: null, is_off: true },
  { staff_id: 's1', roster_date: '2026-06-07', shift_id: 'shiftA', is_off: false },
];
const leaves: ReportLeave[] = [
  { staff_id: 's1', leave_date: '2026-06-04', deduction_days: 0, status: 'approved' },
];
const shifts: ReportShift[] = [
  { id: 'shiftA', name: 'General', check_in_time: '09:00:00', check_out_time: '17:00:00' },
];
const assignments: ReportShiftAssignment[] = [
  { staff_id: 's1', shift_id: 'shiftA', effective_from: '2025-01-01' },
];
const rules = { fullDayMinutes: 480, halfDayMinutes: 240, unscheduledIsOff: false };
const outlets = [{ id: 'o1', name: 'Main' }];

function build() {
  return buildReportDataset({
    from: '2026-06-01', to: '2026-06-07',
    staff, sessions, roster, leaves, shifts, assignments, rules, outlets,
  });
}

describe('shiftMinutes', () => {
  it('computes a normal shift', () => expect(shiftMinutes('09:00:00', '17:00:00')).toBe(480));
  it('handles an overnight shift', () => expect(shiftMinutes('22:00', '06:00')).toBe(480));
});

describe('Muster Roll', () => {
  it('marks each day P/HD/A/L/WO correctly', () => {
    const [row] = musterRows(build());
    // dates: 01 02 03 04 05 06 07
    expect(row.cells).toEqual(['P', 'HD', 'A', 'L', 'A', 'WO', 'P']);
  });

  it('totals present / leave / off / absent against known data', () => {
    const [row] = musterRows(build());
    expect(row.presentFull).toBe(2);
    expect(row.presentHalf).toBe(1);
    expect(row.presentEquiv).toBe(2.5);
    expect(row.leave).toBe(1);
    expect(row.off).toBe(1);
    expect(row.absent).toBe(2);
    expect(row.paidDays).toBe(4.5);
  });

  it('paid days reconcile with the settlement engine (computeDayBreakdown)', () => {
    const bd = computeDayBreakdown({
      monthStart: new Date('2026-06-01T00:00:00'),
      monthEnd: new Date('2026-06-07T00:00:00'),
      dateOfJoining: '2025-01-01',
      dateOfLeaving: null,
      weeklyOffDay: null,
      fullDayMinutes: 480,
      halfDayMinutes: 240,
      unscheduledIsOff: false,
      attendance: sessions.map((s) => ({ work_date: s.work_date, worked_minutes: s.worked_minutes, status: s.status })),
      roster: roster.map((r) => ({ roster_date: r.roster_date, shift_id: r.shift_id, is_off: r.is_off })),
      leaves: leaves.map((l) => ({ leave_date: l.leave_date, deduction_days: l.deduction_days })),
    });
    const settlementPaidDays = bd.presentEquiv + bd.offDays + bd.paidLeaveDays;
    const [row] = musterRows(build());
    expect(row.paidDays).toBe(Math.round(settlementPaidDays * 10) / 10);
  });
});

describe('Daily Punch Report', () => {
  it('emits one row per session with the punch method', () => {
    const rows = dailyPunchRows(build());
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.method).sort()).toEqual(['app', 'app', 'biometric', 'face']);
    const first = rows.find((r) => r.date === '2026-06-01')!;
    expect(first.method).toBe('biometric');
    expect(first.checkIn).toBe('2026-06-01T03:30:00Z');
  });
});

describe('Working Hours Report', () => {
  it('sums worked vs scheduled and per-day overtime', () => {
    const [row] = workingHoursRows(build());
    expect(row.workedMinutes).toBe(1500); // 600+300+120+480
    expect(row.scheduledMinutes).toBe(2880); // 6 working days * 480
    expect(row.overtimeMinutes).toBe(120); // only 2026-06-01 (600-480)
    expect(row.presentDays).toBe(2.5);
  });
});

describe('Shift-Wise Report', () => {
  it('groups day-instances under the assigned shift', () => {
    const rows = shiftWiseRows(build());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.shiftName).toBe('General');
    expect(r.staffCount).toBe(1);
    expect(r.present).toBe(2);
    expect(r.half).toBe(1);
    expect(r.absent).toBe(2);
    expect(r.off).toBe(1);
  });
});

describe('Branch-Wise Punch Report', () => {
  it('groups punches and attendance by outlet', () => {
    const rows = branchWiseRows(build());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.branch).toBe('Main');
    expect(r.staffCount).toBe(1);
    expect(r.punches).toBe(8); // 4 completed sessions * (in + out)
    expect(r.present).toBe(2.5);
    expect(r.absent).toBe(2);
  });
});

describe('Employee Day-Wise Master', () => {
  it('emits one row per employee per window day', () => {
    const rows = employeeDayWiseRows(build());
    expect(rows).toHaveLength(7); // 7 days in the window
    const d3 = rows.find((r) => r.date === '2026-06-03')!;
    expect(d3.mark).toBe('A');
    expect(d3.status).toBe('absent');
    const d1 = rows.find((r) => r.date === '2026-06-01')!;
    expect(d1.workedMinutes).toBe(600);
    expect(d1.checkIn).toBe('2026-06-01T03:30:00Z');
  });
});

describe('Holiday integration', () => {
  function buildWithHoliday(date: string) {
    return buildReportDataset({
      from: '2026-06-01', to: '2026-06-07',
      staff, sessions, roster, leaves, shifts, assignments, rules, outlets,
      holidayDatesByStaff: new Map([['s1', new Set([date])]]),
    });
  }

  it('marks an assigned holiday as a paid off day (H) instead of absent', () => {
    // 2026-06-05 was an absence (no session); a holiday makes it paid off.
    const [row] = musterRows(buildWithHoliday('2026-06-05'));
    expect(row.cells).toEqual(['P', 'HD', 'A', 'L', 'H', 'WO', 'P']);
    expect(row.absent).toBe(1); // only 2026-06-03 remains absent
    expect(row.off).toBe(2); // holiday + weekly-off
    expect(row.paidDays).toBe(5.5); // was 4.5 without the holiday
  });

  it('paid days still reconcile with the settlement engine when holidays apply', () => {
    const bd = computeDayBreakdown({
      monthStart: new Date('2026-06-01T00:00:00'),
      monthEnd: new Date('2026-06-07T00:00:00'),
      dateOfJoining: '2025-01-01', dateOfLeaving: null, weeklyOffDay: null,
      fullDayMinutes: 480, halfDayMinutes: 240, unscheduledIsOff: false,
      holidayDates: new Set(['2026-06-05']),
      attendance: sessions.map((s) => ({ work_date: s.work_date, worked_minutes: s.worked_minutes, status: s.status })),
      roster: roster.map((r) => ({ roster_date: r.roster_date, shift_id: r.shift_id, is_off: r.is_off })),
      leaves: leaves.map((l) => ({ leave_date: l.leave_date, deduction_days: l.deduction_days })),
    });
    const settlementPaid = bd.presentEquiv + bd.offDays + bd.paidLeaveDays;
    const [row] = musterRows(buildWithHoliday('2026-06-05'));
    expect(row.paidDays).toBe(Math.round(settlementPaid * 10) / 10);
  });
});
