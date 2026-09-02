// PHASE 5 — small pure helpers behind the payslip layout (unit-tested).

/** Honorific from staff.gender: Male → "Mr. ", Female → "Ms. ", else none. */
export function honorificFor(gender: string | null | undefined): string {
  const g = (gender ?? '').trim().toLowerCase();
  if (g === 'male' || g === 'm') return 'Mr. ';
  if (g === 'female' || g === 'f') return 'Ms. ';
  return '';
}

/**
 * PAID DAYS — client-confirmed definition (03 Sep 2026): paid days follow the
 * calendar month; week-offs are the actual occurrences of the assigned weekly
 * off day in that month (5 Mondays → 5 offs), and the total is capped at the
 * month's day count:
 *
 *   paidDays = min(daysInMonth, present + half×0.5 + paidLeave + offDays)
 *
 * (The cap is what reconciles the sample slip's PRESENT 27 + W.Off 4 in a
 * 28-day February printing PAID 28.)
 */
export function computePaidDays(input: {
  daysInMonth: number;
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  offDays: number;
}): number {
  const raw =
    Number(input.presentDays || 0) +
    Number(input.halfDays || 0) * 0.5 +
    Number(input.paidLeaveDays || 0) +
    Number(input.offDays || 0);
  return Math.min(Number(input.daysInMonth || 0), raw);
}
