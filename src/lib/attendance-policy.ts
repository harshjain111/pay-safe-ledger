// ============================================================================
// Attendance policy — pure resolution + evaluation logic (no I/O, unit-tested).
// Config rows come from public.attendance_policies; precedence for a given
// staff+outlet is: per-STAFF override > per-OUTLET > GLOBAL default.
// ============================================================================

export type MissedPunchAction = 'none' | 'flag' | 'half_day' | 'cancel_day';

export interface AttendancePolicy {
  grace_minutes: number;
  half_day_after_minutes: number | null;
  missed_punch_action: MissedPunchAction;
  day_start_hour: number;
}

export interface PolicyRow extends AttendancePolicy {
  scope: 'global' | 'outlet' | 'staff';
  outlet_id: string | null;
  staff_id: string | null;
  is_active?: boolean;
}

export const DEFAULT_POLICY: AttendancePolicy = {
  grace_minutes: 10,
  half_day_after_minutes: null,
  missed_punch_action: 'flag',
  day_start_hour: 0,
};

/** Effective policy for a staff member at an outlet: staff > outlet > global > default. */
export function resolvePolicy(
  rows: PolicyRow[],
  target: { staffId?: string | null; outletId?: string | null },
): AttendancePolicy {
  const active = rows.filter((r) => r.is_active !== false);
  const chosen =
    (target.staffId && active.find((r) => r.scope === 'staff' && r.staff_id === target.staffId)) ||
    (target.outletId && active.find((r) => r.scope === 'outlet' && r.outlet_id === target.outletId)) ||
    active.find((r) => r.scope === 'global');
  if (!chosen) return DEFAULT_POLICY;
  return {
    grace_minutes: chosen.grace_minutes,
    half_day_after_minutes: chosen.half_day_after_minutes,
    missed_punch_action: chosen.missed_punch_action,
    day_start_hour: chosen.day_start_hour,
  };
}

export interface LatenessResult {
  /** minutes after scheduled shift start (0 if on time / early). */
  lateMinutes: number;
  isLate: boolean;
  isHalfDay: boolean;
}

/** How late a check-in is versus the scheduled shift start, per policy. */
export function evaluateLateness(
  checkInISO: string,
  shiftStartISO: string,
  policy: AttendancePolicy,
): LatenessResult {
  const diffMin = Math.round((new Date(checkInISO).getTime() - new Date(shiftStartISO).getTime()) / 60000);
  const lateMinutes = Math.max(0, diffMin);
  const isLate = lateMinutes > policy.grace_minutes;
  const isHalfDay =
    isLate && policy.half_day_after_minutes != null && lateMinutes > policy.half_day_after_minutes;
  return { lateMinutes, isLate, isHalfDay };
}

export interface MissedPunchResult {
  missed: boolean;
  action: MissedPunchAction;
  dayCancelled: boolean;
  halfDay: boolean;
}

/** Outcome when a punch (in and/or out) is missing for the day. */
export function evaluateMissedPunch(
  hasCheckIn: boolean,
  hasCheckOut: boolean,
  policy: AttendancePolicy,
): MissedPunchResult {
  const missed = !hasCheckIn || !hasCheckOut;
  if (!missed) return { missed: false, action: 'none', dayCancelled: false, halfDay: false };
  const action = policy.missed_punch_action;
  return {
    missed: true,
    action,
    dayCancelled: action === 'cancel_day',
    halfDay: action === 'half_day',
  };
}

/**
 * The work-date a timestamp belongs to, honouring an outlet's operation-day
 * boundary. day_start_hour 0 = calendar day. day_start_hour 5 means the work-day
 * runs 05:00..04:59 next day, so a 02:00 punch counts for the PREVIOUS date
 * (night shifts). Uses local time (single-timezone deployment).
 */
export function operationWorkDate(tsISO: string, dayStartHour = 0): string {
  const d = new Date(tsISO);
  if (dayStartHour > 0 && d.getHours() < dayStartHour) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
