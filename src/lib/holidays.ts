// ============================================================================
// Holiday resolution — pure helpers (no IO, fully unit-testable).
//
// Resolves which holidays apply to which staff on which dates, expanding
// recurring-yearly holidays across the queried range and honouring org-wide /
// per-branch / per-staff scoping. Both the settlement engine and the attendance
// reports use these so a holiday pays and reconciles identically in each.
// ============================================================================

import { format, parseISO } from 'date-fns';

export interface HolidayRow {
  id: string;
  name: string;
  date: string; // yyyy-MM-dd (canonical occurrence)
  type: string; // 'public' | 'optional' | 'restricted'
  is_paid: boolean;
  recurring_yearly: boolean;
  org_wide: boolean;
}

export interface HolidayAssignmentRow {
  holiday_id: string;
  outlet_id: string | null;
  staff_id: string | null;
}

export interface HolidayStaffRef {
  id: string;
  outlet_id: string | null;
}

/** Mandatory + paid holidays are auto-applied as paid off days. Optional and
 *  restricted holidays are shown on the calendar but never auto-applied. */
export function isMandatoryPaid(h: HolidayRow): boolean {
  return h.type === 'public' && h.is_paid;
}

/** The yyyy-MM-dd dates a holiday actually falls on within [from, to]. */
export function holidayOccurrencesInRange(h: HolidayRow, from: string, to: string): string[] {
  if (!h.recurring_yearly) {
    return h.date >= from && h.date <= to ? [h.date] : [];
  }
  const md = h.date.slice(5); // 'MM-DD'
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const out: string[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const cand = `${y}-${md}`;
    const d = parseISO(cand);
    if (Number.isNaN(d.getTime())) continue;
    if (format(d, 'MM-dd') !== md) continue; // e.g. 29 Feb in a non-leap year
    if (cand >= from && cand <= to) out.push(cand);
  }
  return out;
}

function appliesToStaff(h: HolidayRow, assigns: HolidayAssignmentRow[], staff: HolidayStaffRef): boolean {
  if (h.org_wide) return true;
  return assigns.some(
    (a) =>
      (a.outlet_id != null && a.outlet_id === staff.outlet_id) ||
      (a.staff_id != null && a.staff_id === staff.id),
  );
}

/** Map each staff member to the set of mandatory-paid holiday dates that apply
 *  to them within [from, to]. */
export function resolveHolidayDatesByStaff(
  staffList: HolidayStaffRef[],
  holidays: HolidayRow[],
  assignments: HolidayAssignmentRow[],
  from: string,
  to: string,
): Map<string, Set<string>> {
  const mandatory = holidays.filter(isMandatoryPaid);

  const assignByHoliday = new Map<string, HolidayAssignmentRow[]>();
  for (const a of assignments) {
    const arr = assignByHoliday.get(a.holiday_id);
    if (arr) arr.push(a);
    else assignByHoliday.set(a.holiday_id, [a]);
  }

  const occByHoliday = new Map<string, string[]>();
  for (const h of mandatory) occByHoliday.set(h.id, holidayOccurrencesInRange(h, from, to));

  const result = new Map<string, Set<string>>();
  for (const st of staffList) {
    const set = new Set<string>();
    for (const h of mandatory) {
      const dates = occByHoliday.get(h.id);
      if (!dates || dates.length === 0) continue;
      if (appliesToStaff(h, assignByHoliday.get(h.id) ?? [], st)) {
        for (const d of dates) set.add(d);
      }
    }
    result.set(st.id, set);
  }
  return result;
}

/** Convenience single-staff resolver (used by settlements). */
export function resolveHolidayDatesForStaff(
  staff: HolidayStaffRef,
  holidays: HolidayRow[],
  assignments: HolidayAssignmentRow[],
  from: string,
  to: string,
): Set<string> {
  return resolveHolidayDatesByStaff([staff], holidays, assignments, from, to).get(staff.id) ?? new Set<string>();
}

export interface HolidayOccurrence {
  holiday: HolidayRow;
  date: string; // yyyy-MM-dd actual occurrence
}

/** Every holiday occurrence (any type) within [from, to] — for calendar / roster
 *  display. Sorted by date. */
export function expandHolidaysInRange(holidays: HolidayRow[], from: string, to: string): HolidayOccurrence[] {
  const out: HolidayOccurrence[] = [];
  for (const h of holidays) {
    for (const date of holidayOccurrencesInRange(h, from, to)) out.push({ holiday: h, date });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
