import { useAttendanceOverview } from './useAttendanceOverview';
import type { LateRow } from '@/lib/late';

/**
 * Live "late arrivals" for a date.
 *
 * The rule is unchanged (see src/lib/late.ts for the definition): late =
 * earliest check-in later than the rostered shift start by more than
 * discipline_rules.grace_minutes_in. It is now evaluated inside the
 * get_attendance_overview RPC instead of five client calls across three waves,
 * and shares that call with useAttendanceSummary.
 */
export function useLateForDate(date: string, enabled = true, outletId?: string) {
  const { late, isLoading } = useAttendanceOverview(date, outletId, enabled);
  return { rows: late as LateRow[], count: late.length, isLoading };
}
