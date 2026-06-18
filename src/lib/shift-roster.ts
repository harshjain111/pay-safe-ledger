// ============================================================================
// Shifts & Roster — pure logic (no IO).
//
// §1.3 attendance scoring (punches → Full/Half/Absent against the working-hour
// config, with attendance_mode), config effective-dating (next-day + history),
// and the §7 custom roster model (sparse resolution, infer_shift, auto-promote
// on check-in, and reversal). The thin DB wrappers + the check-in hook call
// these; every rule the spec flags for tests lives here.
// ============================================================================

import { parseISO, addDays, format } from 'date-fns';

// ---- §1.3 working-hour scoring --------------------------------------------

export type DayScore = 'FULL' | 'HALF' | 'ABSENT';
export type AttendanceMode = 'ALL_PUNCH' | 'FIRST_LAST_ONLY' | 'SINGLE_PUNCH_FULL' | 'DEFAULT_FULL';

export interface WorkingHourConfig {
  full_day_minutes: number; // worked ≥ this ⇒ FULL
  half_day_minutes: number; // worked ≥ this & < full ⇒ HALF; below ⇒ ABSENT
  attendance_mode: AttendanceMode;
}

/** A punch pair for a day; `out` may be missing (forgot to check out). */
export interface Punch { in: string; out?: string | null }

const minutesBetween = (a: string, b: string): number =>
  Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));

/**
 * Raw worked minutes from punches.
 *  - ALL_PUNCH: sum of every in→out pair (multiple sessions/day).
 *  - FIRST_LAST_ONLY: first check-in → last check-out (ignores middle breaks).
 */
export function computeWorkedMinutes(punches: Punch[], mode: AttendanceMode): number {
  const valid = punches.filter((p) => p.in);
  if (valid.length === 0) return 0;
  if (mode === 'FIRST_LAST_ONLY') {
    const outs = valid.map((p) => p.out).filter((o): o is string => !!o);
    if (outs.length === 0) return 0;
    const firstIn = valid.map((p) => p.in).sort()[0];
    const lastOut = outs.sort()[outs.length - 1];
    return minutesBetween(firstIn, lastOut);
  }
  // ALL_PUNCH (also the minute basis when SINGLE_PUNCH_FULL has real pairs)
  return valid.reduce((sum, p) => sum + (p.out ? minutesBetween(p.in, p.out) : 0), 0);
}

/**
 * Score a day's punches against the config.
 *  - no punches ⇒ ABSENT.
 *  - DEFAULT_FULL ⇒ any presence is a FULL day.
 *  - SINGLE_PUNCH_FULL ⇒ a lone punch (no check-out) is FULL; with real in/out
 *    pairs it scores by hours (forgot-to-checkout treated generously).
 *  - ALL_PUNCH / FIRST_LAST_ONLY ⇒ worked minutes vs full/half thresholds.
 */
export function scoreDay(punches: Punch[], config: WorkingHourConfig): DayScore {
  const present = punches.some((p) => p.in);
  if (!present) return 'ABSENT';
  if (config.attendance_mode === 'DEFAULT_FULL') return 'FULL';

  const byHours = (mode: AttendanceMode): DayScore => {
    const worked = computeWorkedMinutes(punches, mode);
    if (worked >= config.full_day_minutes) return 'FULL';
    if (worked >= config.half_day_minutes) return 'HALF';
    return 'ABSENT';
  };

  if (config.attendance_mode === 'SINGLE_PUNCH_FULL') {
    return punches.some((p) => p.out) ? byHours('ALL_PUNCH') : 'FULL';
  }
  return byHours(config.attendance_mode);
}

// ---- working-hour config effective-dating ----------------------------------

export interface ConfigHistoryRow extends WorkingHourConfig { effective_from: string } // yyyy-MM-dd

/** The config effective on `dateISO` = the latest row with effective_from ≤ date. */
export function configForDate(history: ConfigHistoryRow[], dateISO: string): ConfigHistoryRow | null {
  const eligible = history
    .filter((h) => h.effective_from <= dateISO)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return eligible[0] ?? null;
}

/** A config change saved on `todayISO` takes effect the NEXT day. */
export function nextEffectiveFrom(todayISO: string): string {
  return format(addDays(parseISO(todayISO), 1), 'yyyy-MM-dd');
}

// ---- §7 custom roster model ------------------------------------------------

export type RosterStatus = 'SCHEDULED' | 'OFF' | 'AUTO_PRESENT';
export type RosterSource = 'TEMPLATE' | 'MANUAL' | 'AUTO_CHECKIN';
export interface RosterEntry { shift_id: string | null; status: RosterStatus; source: RosterSource }

export interface WorkResolution {
  working: boolean;
  shiftId: string | null; // null ⇒ Open Shift (hours decide)
  reason: 'SCHEDULED' | 'AUTO_PRESENT' | 'OFF' | 'NOT_SCHEDULED';
}

/** §7.2 — "Is X working on date D?" (no entry ⇒ OFF by default / not scheduled). */
export function resolveWorking(entry: RosterEntry | null | undefined): WorkResolution {
  if (!entry) return { working: false, shiftId: null, reason: 'NOT_SCHEDULED' };
  if (entry.status === 'OFF') return { working: false, shiftId: null, reason: 'OFF' };
  return { working: true, shiftId: entry.shift_id, reason: entry.status };
}

/** §7.3 infer_shift — the employee's Shift Assignment for that weekday, else Open Shift (null). */
export function inferShift(assignmentByWeekday: Map<number, string | null>, weekday: number): string | null {
  return assignmentByWeekday.get(weekday) ?? null;
}

/** §7.3 — a check-in auto-promotes when there is no entry, or the entry is OFF. */
export function shouldAutoPromote(entry: RosterEntry | null | undefined): boolean {
  return !entry || entry.status === 'OFF';
}

/** The roster entry an auto-promote upserts. */
export function autoPromoteEntry(shiftId: string | null): RosterEntry {
  return { shift_id: shiftId, status: 'AUTO_PRESENT', source: 'AUTO_CHECKIN' };
}

/** §7.4 reversal — drop the entry only if it was auto-added AND no punches remain. */
export function shouldReverseAutoEntry(entry: RosterEntry | null | undefined, punchesRemain: boolean): boolean {
  return !!entry && entry.source === 'AUTO_CHECKIN' && !punchesRemain;
}

// ---- weekly template → roster projection -----------------------------------

export type WeekOffState = 'WORKING' | 'WEEK_OFF' | 'OCCASIONAL_WEEK_OFF';
export interface ProjectedCell { status: RosterStatus; shiftId: string | null; source: 'TEMPLATE' }

/**
 * Project the weekly template (Shift Assignment ⊕ Week Off) onto a weekday.
 *  - a declared week-off ⇒ an explicit OFF row (planned off, distinct in reports);
 *  - an assigned shift   ⇒ a SCHEDULED row;
 *  - neither             ⇒ null (sparse: no row ⇒ off-by-default, not scheduled).
 */
export function projectTemplate(
  weekday: number,
  assignmentByWeekday: Map<number, string | null>,
  weekOffByWeekday: Map<number, WeekOffState>,
): ProjectedCell | null {
  const off = weekOffByWeekday.get(weekday);
  if (off === 'WEEK_OFF' || off === 'OCCASIONAL_WEEK_OFF') {
    return { status: 'OFF', shiftId: null, source: 'TEMPLATE' };
  }
  const shift = assignmentByWeekday.get(weekday);
  if (shift) return { status: 'SCHEDULED', shiftId: shift, source: 'TEMPLATE' };
  return null;
}
