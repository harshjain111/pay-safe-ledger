import { useAttendanceOverview, type AttendanceSummary } from './useAttendanceOverview';

export type { AttendanceSummary };

/**
 * Live attendance roll-up for one date. Mirrors the Attendance page's data
 * model (attendance_sessions status active/on_break/completed, attendance-
 * tracked active staff, approved leave_records) so the numbers always agree.
 *
 * The three queries this used to run — and the client-side joining of them —
 * now live in the get_attendance_overview RPC, shared with useLateForDate so
 * both read one call. See useAttendanceOverview.
 */
export function useAttendanceSummary(date: string, outletId?: string) {
  const { summary, isLoading, refetch } = useAttendanceOverview(date, outletId);
  return { summary, isLoading, refetch };
}
