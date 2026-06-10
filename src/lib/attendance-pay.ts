import {
  eachDayOfInterval,
  format,
  getDay,
  parseISO,
  max as maxDate,
  min as minDate,
} from 'date-fns';

export interface AttendanceSessionLite {
  work_date: string;
  worked_minutes: number | null;
  status: string;
}
export interface RosterLite {
  roster_date: string;
  shift_id: string | null;
  is_off: boolean;
}
export interface LeaveLite {
  leave_date: string;
  deduction_days: number | null;
}

export interface DayBreakdown {
  presentFull: number; // count of full present days
  presentHalf: number; // count of half present days
  paidLeaveDays: number; // sum of (1 - deduction_days) for approved leaves
  offDays: number; // rostered / weekly-off days NOT worked (paid)
  offWorkedDays: number; // off days that were worked (comp-off candidates)
  absentDays: number; // full absent days (working day, no attendance, no leave)
  /** Days to dock from full proration: full absences (1) + unpaid half-days (0.5). */
  absentDeductionDays: number;
  presentEquiv: number; // presentFull + 0.5*presentHalf
  windowDays: number; // total days in the employment window this month
  workingDays: number; // window days that are not off
}

/**
 * Classifies every day of a staff member's employment window within the month
 * into present / half / paid-leave / off / absent, from attendance + roster +
 * approved leaves. `absentDeductionDays` is designed to be subtracted from the
 * existing full-month proration (which already pays every window day): combined
 * with the existing leave deduction, the net paid days become
 * present + paid-leave + off, with unpaid absences and unpaid-leave docked.
 */
export function computeDayBreakdown(params: {
  monthStart: Date;
  monthEnd: Date;
  dateOfJoining: string;
  dateOfLeaving?: string | null;
  weeklyOffDay: number | null;
  fullDayMinutes: number;
  halfDayMinutes: number;
  /** When true, a day with no shift allotted in the roster is treated as OFF. */
  unscheduledIsOff: boolean;
  /** Dates (yyyy-MM-dd) that already incurred a late/early discipline fine; the
   *  short-attendance dock is suppressed on these so a day isn't penalised twice. */
  disciplineFinedDates?: Set<string>;
  attendance: AttendanceSessionLite[];
  roster: RosterLite[];
  leaves: LeaveLite[];
}): DayBreakdown {
  const { monthStart, monthEnd, weeklyOffDay, fullDayMinutes, halfDayMinutes, unscheduledIsOff } = params;
  const disciplineFinedDates = params.disciplineFinedDates ?? new Set<string>();

  const joining = parseISO(params.dateOfJoining);
  const leaving = params.dateOfLeaving ? parseISO(params.dateOfLeaving) : null;
  const windowStart = maxDate([monthStart, joining]);
  const windowEnd = leaving ? minDate([monthEnd, leaving]) : monthEnd;

  const result: DayBreakdown = {
    presentFull: 0,
    presentHalf: 0,
    paidLeaveDays: 0,
    offDays: 0,
    offWorkedDays: 0,
    absentDays: 0,
    absentDeductionDays: 0,
    presentEquiv: 0,
    windowDays: 0,
    workingDays: 0,
  };
  if (windowEnd < windowStart) return result;

  // Sum worked minutes across all COMPLETED sessions for a date (split shifts /
  // second check-ins). Open (active/on_break) sessions are excluded — they have
  // no final worked_minutes and must not be mistaken for a full absence.
  const workedByDate = new Map<string, number>();
  for (const a of params.attendance) {
    if (a.status === 'completed') {
      workedByDate.set(a.work_date, (workedByDate.get(a.work_date) ?? 0) + Number(a.worked_minutes ?? 0));
    }
  }
  const ros = new Map<string, RosterLite>();
  for (const r of params.roster) ros.set(r.roster_date, r);
  const lv = new Map<string, LeaveLite>();
  for (const l of params.leaves) lv.set(l.leave_date, l);

  for (const d of eachDayOfInterval({ start: windowStart, end: windowEnd })) {
    const ds = format(d, 'yyyy-MM-dd');
    result.windowDays += 1;

    const rosterRow = ros.get(ds);
    // A day is OFF when: the roster marks it off / assigns no shift; OR there is
    // no roster entry and the org treats unscheduled days as off; OR (legacy) it
    // falls on the staff member's weekly-off day.
    let isOff: boolean;
    if (rosterRow) {
      isOff = rosterRow.is_off || !rosterRow.shift_id;
    } else if (unscheduledIsOff) {
      isOff = true;
    } else {
      isOff = weeklyOffDay != null && getDay(d) === weeklyOffDay;
    }
    if (!isOff) result.workingDays += 1;

    const hasSession = workedByDate.has(ds);
    const worked = hasSession ? (workedByDate.get(ds) ?? 0) : 0;
    const leave = lv.get(ds);
    const disciplineFined = disciplineFinedDates.has(ds);

    // 1) A completed session exists -> present (and a comp-off candidate if off).
    if (hasSession) {
      if (worked >= fullDayMinutes) {
        result.presentFull += 1;
      } else if (worked >= halfDayMinutes) {
        result.presentHalf += 1;
        // Only dock the half-day shortfall if a discipline fine isn't already
        // penalising this date (otherwise the day would be docked twice).
        if (!isOff && !leave && !disciplineFined) result.absentDeductionDays += 0.5;
      } else {
        if (!isOff && !leave) {
          result.absentDays += 1;
          if (!disciplineFined) result.absentDeductionDays += 1;
        }
      }
      if (isOff && worked >= halfDayMinutes) result.offWorkedDays += 1;
      continue;
    }

    // 2) Approved leave -> the unpaid portion is docked by the existing leave
    //    deduction; here we only track the paid portion for the breakdown.
    if (leave) {
      const ded = Math.min(1, Math.max(0, Number(leave.deduction_days ?? 0)));
      result.paidLeaveDays += 1 - ded;
      continue;
    }

    // 3) Off day, not worked -> paid.
    if (isOff) {
      result.offDays += 1;
      continue;
    }

    // 4) Working day with no attendance and no leave -> unpaid absence.
    result.absentDays += 1;
    result.absentDeductionDays += 1;
  }

  result.presentEquiv = result.presentFull + 0.5 * result.presentHalf;
  return result;
}
