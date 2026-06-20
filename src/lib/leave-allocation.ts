// ============================================================================
// Leaves & Holidays — pure business logic (no IO).
//
// Every rule the spec mandates tests for lives here so it is deterministic and
// unit-tested: auto-allocation, carry-forward cap + forfeit, encashment split,
// the assign/adjust/template guards (with the exact required messages), the
// idempotent assignment plan, and multi-day holiday expansion (consumed by the
// settlement engine in step e). The thin DB wrappers in leave-service.ts call
// these; the cron jobs reuse them too.
// ============================================================================

import { parseISO, addDays, format, isBefore, isAfter } from 'date-fns';

export type Period = 'MONTH' | 'YEAR';

export interface LeaveTypeConfig {
  no_of_auto_allocation_leaves: number;
  auto_allocation_period: Period;
  carry_forward_leaves: number;
  carry_forward_period: Period;
  encashment_enabled: boolean;
  encashment_limit: number | null;
  encashment_period: Period | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ---- auto-allocation -------------------------------------------------------

/** Credit the configured auto-allocation qty to a balance. */
export function applyAutoAllocation(
  balance: number,
  type: Pick<LeaveTypeConfig, 'no_of_auto_allocation_leaves'>,
): number {
  return round2(num(balance) + Math.max(0, num(type.no_of_auto_allocation_leaves)));
}

/**
 * Does a type with this allocation period fire on the given boundary?
 * MONTH types credit every month (and thus also at year-end month); YEAR types
 * credit once, on the year boundary only.
 */
export function allocatesOn(period: Period, boundary: 'MONTH' | 'YEAR'): boolean {
  return period === 'MONTH' ? true : boundary === 'YEAR';
}

// ---- carry-forward + encashment -------------------------------------------

export interface PeriodEndResult {
  carried: number;   // rolls over to the next period
  encashed: number;  // paid out (units) — emitted as a leave_encashment record
  forfeited: number; // lost
}

/**
 * Apply the carry-forward cap and encashment at a period boundary.
 *
 *   carried   = min(balance, carry_forward_leaves)        // rolls over
 *   leftover  = balance - carried                         // would be forfeited
 *   encashed  = encashment_enabled
 *                 ? clamp(balance - encashment_limit, 0, leftover)
 *                 : 0
 *   forfeited = leftover - encashed
 *
 * Two thresholds by design: `carry_forward_leaves` decides what rolls over;
 * `encashment_limit` decides how much of the remainder is paid out vs forfeited.
 */
export function applyPeriodEnd(balance: number, type: LeaveTypeConfig): PeriodEndResult {
  const b = Math.max(0, num(balance));
  const carried = clamp(b, 0, Math.max(0, num(type.carry_forward_leaves)));
  const leftover = round2(b - carried);
  let encashed = 0;
  if (type.encashment_enabled) {
    const limit = Math.max(0, num(type.encashment_limit ?? 0));
    encashed = clamp(round2(b - limit), 0, leftover);
  }
  const forfeited = round2(leftover - encashed);
  return { carried: round2(carried), encashed: round2(encashed), forfeited };
}

// ---- validation guards (exact spec messages) -------------------------------

/** Bulk Assign: "Please select at least one employee." */
export function validateEmployeeSelection(ids: string[]): string | null {
  return ids.length === 0 ? 'Please select at least one employee.' : null;
}

/** Holiday Assign: blocked until a template exists. */
export function validateHolidayTemplateExists(templateCount: number): string | null {
  return templateCount <= 0 ? 'Please create a holiday template first.' : null;
}

/** Bulk Adjust: a leave type + MANDATORY remarks. */
export function validateBalanceAdjustment(input: { leaveId?: string | null; comment?: string | null }): string | null {
  if (!input.leaveId) return 'Choose a leave type.';
  if (!input.comment || !input.comment.trim()) return 'Remarks are required.';
  return null;
}

/** Leave Create: name + alias required; encashment fields required only when enabled. */
export function validateLeaveTypeForm(
  form: Partial<LeaveTypeConfig> & { name?: string | null; code?: string | null },
): string | null {
  if (!form.name?.trim()) return 'Leave Name is required.';
  if (!form.code?.trim()) return 'Alias is required.';
  if (form.encashment_enabled) {
    if (form.encashment_limit == null || !Number.isFinite(Number(form.encashment_limit))) {
      return 'Encashment Limit is required when encashment is enabled.';
    }
    if (!form.encashment_period) return 'Encashment period is required when encashment is enabled.';
  }
  return null;
}

// ---- idempotent assignment -------------------------------------------------

/**
 * The (staff_id, leave_type_id) links to CREATE — only pairs that don't already
 * exist, never duplicated within the batch. Re-assigning an existing type is a
 * no-op (existing balances are left untouched).
 */
export function planAssignments(
  staffIds: string[],
  leaveTypeIds: string[],
  existing: Array<{ staff_id: string; leave_type_id: string }>,
): Array<{ staff_id: string; leave_type_id: string }> {
  const have = new Set(existing.map((e) => `${e.staff_id}:${e.leave_type_id}`));
  const out: Array<{ staff_id: string; leave_type_id: string }> = [];
  for (const s of staffIds) {
    for (const t of leaveTypeIds) {
      const k = `${s}:${t}`;
      if (!have.has(k)) {
        have.add(k);
        out.push({ staff_id: s, leave_type_id: t });
      }
    }
  }
  return out;
}

// ---- multi-day holiday expansion (engine wiring, step e) -------------------

/**
 * Expand holiday day-ranges into the set of ISO dates (yyyy-MM-dd) that fall
 * within the inclusive [fromISO, toISO] window. Multi-day holidays expand to one
 * entry per day; days outside the window are dropped.
 */
export function expandHolidayDays(
  days: Array<{ start_date: string; end_date: string }>,
  fromISO: string,
  toISO: string,
): Set<string> {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  const out = new Set<string>();
  for (const d of days) {
    const end = parseISO(d.end_date);
    let cur = parseISO(d.start_date);
    let guard = 0;
    while (!isAfter(cur, end) && guard++ < 3660) {
      if (!isBefore(cur, from) && !isAfter(cur, to)) out.add(format(cur, 'yyyy-MM-dd'));
      cur = addDays(cur, 1);
    }
  }
  return out;
}

/**
 * Union a base holiday-date set with the dates an assigned holiday TEMPLATE
 * contributes within [from, to] (each template day-range expanded). The
 * settlement engine folds this in so template holidays count as paid days.
 */
export function mergeTemplateHolidays(
  base: Set<string>,
  templateDays: Array<{ start_date: string; end_date: string }>,
  fromISO: string,
  toISO: string,
): Set<string> {
  const out = new Set(base);
  for (const d of expandHolidayDays(templateDays, fromISO, toISO)) out.add(d);
  return out;
}
