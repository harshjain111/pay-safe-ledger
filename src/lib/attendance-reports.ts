// ============================================================================
// Statutory attendance reports — pure derivation engine.
//
// Every report is derived from the SAME attendance data settlements use, and
// each staff member's per-day classification comes from `computeDayBreakdown`
// (the settlement engine). So the Muster Roll's "paid days" reconciles exactly
// with what settlements pay: paidDays = presentEquiv + offDays + paidLeaveDays.
//
// This module does NO IO — it takes already-fetched rows and returns report
// rows, so it is fully unit-testable. The hook (useAttendanceReportData) does
// the fetching.
// ============================================================================

import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { computeDayBreakdown, type DayBreakdown, type DayMark, type DayStatus } from './attendance-pay';

export type { DayStatus, DayMark } from './attendance-pay';

/** Muster-roll cell letters for each day status. */
export const MARK_LETTER: Record<DayStatus, string> = {
  present_full: 'P',
  present_half: 'HD',
  leave: 'L',
  off: 'WO',
  holiday: 'H',
  absent: 'A',
};

// ---- input row shapes (subsets of the DB tables) ---------------------------
export interface ReportStaff {
  id: string;
  full_name: string;
  employee_id: string;
  department: string | null;
  department_id: string | null;
  designation: string | null;
  outlet_id: string | null;
  date_of_joining: string;
  date_of_leaving: string | null;
  weekly_off_day: number | null;
}
export interface ReportSession {
  staff_id: string;
  work_date: string;
  worked_minutes: number | null;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  source: string | null;
}
export interface ReportRoster {
  staff_id: string;
  roster_date: string;
  shift_id: string | null;
  is_off: boolean;
}
export interface ReportLeave {
  staff_id: string;
  leave_date: string;
  deduction_days: number | null;
  status?: string | null;
  leave_type?: string | null;
}
export interface ReportShift {
  id: string;
  name: string;
  check_in_time: string;
  check_out_time: string;
}
export interface ReportShiftAssignment {
  staff_id: string;
  shift_id: string | null;
  effective_from: string;
}
export interface PayRules {
  fullDayMinutes: number;
  halfDayMinutes: number;
  unscheduledIsOff: boolean;
}

// ---- helpers ---------------------------------------------------------------
export function timeToMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
}
/** Length of a shift in minutes, accounting for overnight shifts. */
export function shiftMinutes(checkIn: string, checkOut: string): number {
  const a = timeToMinutes(checkIn);
  let b = timeToMinutes(checkOut);
  if (b <= a) b += 24 * 60;
  return b - a;
}
export function formatHM(min: number): string {
  const sign = min < 0 ? '-' : '';
  const x = Math.abs(Math.round(min));
  return `${sign}${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// ---- per-staff computed report ---------------------------------------------
export interface StaffReport {
  staff: ReportStaff;
  breakdown: DayBreakdown;
  marksByDate: Map<string, DayMark>;
  /** Scheduled minutes per working date (from roster shift, else default shift,
   *  else the org full-day standard). Off days are absent from this map. */
  scheduledByDate: Map<string, number>;
  /** Worked minutes per date from completed sessions. */
  workedByDate: Map<string, number>;
  /** The shift assigned to each date (roster shift, else the staff default). */
  shiftIdByDate: Map<string, string | null>;
  sessionsByDate: Map<string, ReportSession[]>;
}

export interface AttendanceReportDataset {
  from: string;
  to: string;
  dates: string[];
  staffReports: StaffReport[];
  shiftsById: Map<string, ReportShift>;
  outletNameById: Map<string, string>;
  sessions: ReportSession[];
}

export function buildReportDataset(input: {
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
  staff: ReportStaff[];
  sessions: ReportSession[];
  roster: ReportRoster[];
  leaves: ReportLeave[];
  shifts: ReportShift[];
  assignments: ReportShiftAssignment[];
  rules: PayRules;
  outlets: { id: string; name: string }[];
  /** Per-staff mandatory-paid holiday dates (yyyy-MM-dd) to treat as paid off. */
  holidayDatesByStaff?: Map<string, Set<string>>;
}): AttendanceReportDataset {
  const { from, to, staff, sessions, roster, leaves, shifts, assignments, rules, outlets, holidayDatesByStaff } = input;
  const monthStart = parseISO(from);
  const monthEnd = parseISO(to);
  const dates = eachDayOfInterval({ start: monthStart, end: monthEnd }).map((d) => format(d, 'yyyy-MM-dd'));

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const outletNameById = new Map(outlets.map((o) => [o.id, o.name]));

  const sessByStaff = groupBy(sessions, (s) => s.staff_id);
  const rosByStaff = groupBy(roster, (r) => r.staff_id);
  const lvByStaff = groupBy(leaves, (l) => l.staff_id);

  // Latest shift assignment effective on/before the period end, per staff.
  const assignByStaff = new Map<string, ReportShiftAssignment>();
  for (const a of assignments) {
    if (a.effective_from > to) continue;
    const cur = assignByStaff.get(a.staff_id);
    if (!cur || a.effective_from > cur.effective_from) assignByStaff.set(a.staff_id, a);
  }

  const staffReports: StaffReport[] = staff.map((st) => {
    const stSessions = sessByStaff.get(st.id) ?? [];
    const stRoster = rosByStaff.get(st.id) ?? [];
    const stLeaves = (lvByStaff.get(st.id) ?? []).filter((l) => (l.status ?? 'approved') === 'approved');

    const breakdown = computeDayBreakdown({
      monthStart,
      monthEnd,
      dateOfJoining: st.date_of_joining,
      dateOfLeaving: st.date_of_leaving ?? null,
      weeklyOffDay: st.weekly_off_day ?? null,
      fullDayMinutes: rules.fullDayMinutes,
      halfDayMinutes: rules.halfDayMinutes,
      unscheduledIsOff: rules.unscheduledIsOff,
      holidayDates: holidayDatesByStaff?.get(st.id),
      attendance: stSessions.map((s) => ({
        work_date: s.work_date,
        worked_minutes: s.worked_minutes,
        status: s.status,
      })),
      roster: stRoster.map((r) => ({ roster_date: r.roster_date, shift_id: r.shift_id, is_off: r.is_off })),
      leaves: stLeaves.map((l) => ({ leave_date: l.leave_date, deduction_days: l.deduction_days })),
    });

    const marksByDate = new Map(breakdown.days.map((d) => [d.date, d]));

    const workedByDate = new Map<string, number>();
    const sessionsByDate = new Map<string, ReportSession[]>();
    for (const s of stSessions) {
      if (s.status === 'completed') {
        workedByDate.set(s.work_date, (workedByDate.get(s.work_date) ?? 0) + Number(s.worked_minutes ?? 0));
      }
      const arr = sessionsByDate.get(s.work_date);
      if (arr) arr.push(s);
      else sessionsByDate.set(s.work_date, [s]);
    }

    const rosterByDate = new Map(stRoster.map((r) => [r.roster_date, r]));
    const defaultShiftId = assignByStaff.get(st.id)?.shift_id ?? null;
    const scheduledByDate = new Map<string, number>();
    const shiftIdByDate = new Map<string, string | null>();
    for (const mark of breakdown.days) {
      const rd = rosterByDate.get(mark.date);
      const shiftId = rd?.shift_id ?? defaultShiftId;
      shiftIdByDate.set(mark.date, shiftId);
      if (mark.isOff) continue; // off days are not scheduled
      const shift = shiftId ? shiftsById.get(shiftId) : undefined;
      scheduledByDate.set(mark.date, shift ? shiftMinutes(shift.check_in_time, shift.check_out_time) : rules.fullDayMinutes);
    }

    return { staff: st, breakdown, marksByDate, scheduledByDate, workedByDate, shiftIdByDate, sessionsByDate };
  });

  return { from, to, dates, staffReports, shiftsById, outletNameById, sessions };
}

// ===========================================================================
// Report row selectors
// ===========================================================================

// ---- 1. Muster Roll --------------------------------------------------------
export interface MusterRow {
  staff: ReportStaff;
  /** One letter per date in dataset.dates ('' = outside employment window). */
  cells: string[];
  presentFull: number;
  presentHalf: number;
  presentEquiv: number;
  leave: number; // paid-leave days
  off: number;
  absent: number;
  paidDays: number; // reconciles with settlements
}
export function musterRows(ds: AttendanceReportDataset): MusterRow[] {
  return ds.staffReports.map((sr) => {
    const b = sr.breakdown;
    return {
      staff: sr.staff,
      cells: ds.dates.map((d) => {
        const mark = sr.marksByDate.get(d);
        return mark ? MARK_LETTER[mark.status] : '';
      }),
      presentFull: b.presentFull,
      presentHalf: b.presentHalf,
      presentEquiv: round1(b.presentEquiv),
      leave: round1(b.paidLeaveDays),
      off: b.offDays,
      absent: b.absentDays,
      paidDays: round1(b.presentEquiv + b.offDays + b.paidLeaveDays),
    };
  });
}

// ---- 2. Daily Punch Report -------------------------------------------------
export interface DailyPunchRow {
  staff: ReportStaff;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  method: string;
  workedMinutes: number | null;
  status: string;
}
export function dailyPunchRows(ds: AttendanceReportDataset): DailyPunchRow[] {
  const staffById = new Map(ds.staffReports.map((sr) => [sr.staff.id, sr.staff]));
  const rows: DailyPunchRow[] = [];
  for (const s of ds.sessions) {
    const staff = staffById.get(s.staff_id);
    if (!staff) continue; // not in the filtered set
    if (s.work_date < ds.from || s.work_date > ds.to) continue;
    rows.push({
      staff,
      date: s.work_date,
      checkIn: s.check_in_at,
      checkOut: s.check_out_at,
      method: s.source ?? 'app',
      workedMinutes: s.worked_minutes,
      status: s.status,
    });
  }
  rows.sort((a, b) => (a.date === b.date ? a.staff.full_name.localeCompare(b.staff.full_name) : a.date.localeCompare(b.date)));
  return rows;
}

// ---- 3. Working Hours Report ----------------------------------------------
export interface WorkingHoursRow {
  staff: ReportStaff;
  workedMinutes: number;
  scheduledMinutes: number;
  overtimeMinutes: number;
  presentDays: number;
}
export function workingHoursRows(ds: AttendanceReportDataset): WorkingHoursRow[] {
  return ds.staffReports.map((sr) => {
    let worked = 0;
    let scheduled = 0;
    let overtime = 0;
    for (const date of sr.breakdown.days.map((d) => d.date)) {
      const w = sr.workedByDate.get(date) ?? 0;
      const sched = sr.scheduledByDate.get(date) ?? 0;
      worked += w;
      scheduled += sched;
      if (w > sched) overtime += w - sched; // per-day overtime (no cross-day offset)
    }
    return {
      staff: sr.staff,
      workedMinutes: worked,
      scheduledMinutes: scheduled,
      overtimeMinutes: overtime,
      presentDays: round1(sr.breakdown.presentEquiv),
    };
  });
}

// ---- 4. Shift-Wise Report --------------------------------------------------
export interface ShiftWiseRow {
  shiftId: string | null;
  shiftName: string;
  timing: string;
  staffCount: number;
  present: number; // full present day-instances
  half: number;
  absent: number;
  off: number;
}
export function shiftWiseRows(ds: AttendanceReportDataset): ShiftWiseRow[] {
  interface Acc { staff: Set<string>; present: number; half: number; absent: number; off: number; }
  const acc = new Map<string, Acc>();
  const ensure = (id: string) => {
    let a = acc.get(id);
    if (!a) { a = { staff: new Set(), present: 0, half: 0, absent: 0, off: 0 }; acc.set(id, a); }
    return a;
  };

  for (const sr of ds.staffReports) {
    for (const mark of sr.breakdown.days) {
      const shiftId = sr.shiftIdByDate.get(mark.date) ?? null;
      const key = shiftId ?? '__none__';
      const a = ensure(key);
      a.staff.add(sr.staff.id);
      if (mark.status === 'present_full') a.present += 1;
      else if (mark.status === 'present_half') a.half += 1;
      else if (mark.status === 'absent') a.absent += 1;
      else if (mark.status === 'off') a.off += 1;
    }
  }

  const rows: ShiftWiseRow[] = [];
  for (const [key, a] of acc) {
    const shift = key === '__none__' ? undefined : ds.shiftsById.get(key);
    rows.push({
      shiftId: key === '__none__' ? null : key,
      shiftName: shift ? shift.name : 'Unassigned',
      timing: shift ? `${shift.check_in_time.slice(0, 5)}–${shift.check_out_time.slice(0, 5)}` : '—',
      staffCount: a.staff.size,
      present: a.present,
      half: a.half,
      absent: a.absent,
      off: a.off,
    });
  }
  rows.sort((x, y) => x.shiftName.localeCompare(y.shiftName));
  return rows;
}

// ---- 5. Branch-Wise Punch Report ------------------------------------------
export interface BranchWiseRow {
  outletId: string | null;
  branch: string;
  staffCount: number;
  punches: number; // in + out events
  present: number; // present-equiv days
  absent: number;
}
export function branchWiseRows(ds: AttendanceReportDataset): BranchWiseRow[] {
  interface Acc { staff: Set<string>; punches: number; present: number; absent: number; }
  const acc = new Map<string, Acc>();
  const ensure = (id: string) => {
    let a = acc.get(id);
    if (!a) { a = { staff: new Set(), punches: 0, present: 0, absent: 0 }; acc.set(id, a); }
    return a;
  };

  for (const sr of ds.staffReports) {
    const key = sr.staff.outlet_id ?? '__none__';
    const a = ensure(key);
    a.staff.add(sr.staff.id);
    a.present += sr.breakdown.presentEquiv;
    a.absent += sr.breakdown.absentDays;
    // Punches: each session contributes a check-in (+1) and a check-out (+1).
    for (const [, daySessions] of sr.sessionsByDate) {
      for (const s of daySessions) {
        if (s.check_in_at) a.punches += 1;
        if (s.check_out_at) a.punches += 1;
      }
    }
  }

  const rows: BranchWiseRow[] = [];
  for (const [key, a] of acc) {
    rows.push({
      outletId: key === '__none__' ? null : key,
      branch: key === '__none__' ? 'Unassigned' : ds.outletNameById.get(key) ?? 'Unknown',
      staffCount: a.staff.size,
      punches: a.punches,
      present: round1(a.present),
      absent: a.absent,
    });
  }
  rows.sort((x, y) => x.branch.localeCompare(y.branch));
  return rows;
}

// ---- 6. Employee Day-Wise Master ------------------------------------------
export interface DayWiseRow {
  staff: ReportStaff;
  date: string;
  status: DayStatus;
  mark: string;
  workedMinutes: number;
  scheduledMinutes: number;
  shiftName: string;
  checkIn: string | null;
  checkOut: string | null;
}
export function employeeDayWiseRows(ds: AttendanceReportDataset): DayWiseRow[] {
  const rows: DayWiseRow[] = [];
  for (const sr of ds.staffReports) {
    for (const mark of sr.breakdown.days) {
      const shiftId = sr.shiftIdByDate.get(mark.date) ?? null;
      const shift = shiftId ? ds.shiftsById.get(shiftId) : undefined;
      const daySessions = sr.sessionsByDate.get(mark.date) ?? [];
      const checkIn = daySessions.length ? daySessions[0].check_in_at : null;
      const lastOut = [...daySessions].reverse().find((s) => s.check_out_at)?.check_out_at ?? null;
      rows.push({
        staff: sr.staff,
        date: mark.date,
        status: mark.status,
        mark: MARK_LETTER[mark.status],
        workedMinutes: sr.workedByDate.get(mark.date) ?? 0,
        scheduledMinutes: sr.scheduledByDate.get(mark.date) ?? 0,
        shiftName: shift ? shift.name : mark.isOff ? 'Off' : 'Unassigned',
        checkIn,
        checkOut: lastOut,
      });
    }
  }
  rows.sort((a, b) =>
    a.staff.full_name === b.staff.full_name ? a.date.localeCompare(b.date) : a.staff.full_name.localeCompare(b.staff.full_name),
  );
  return rows;
}
