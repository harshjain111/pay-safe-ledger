import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import type { LateRow } from '@/lib/late';

export interface AttendanceSummary {
  date: string;
  totalTracked: number;
  /** Distinct staff who have any session on the date (= "Present"). */
  present: number;
  /** Sessions currently in each state. */
  checkedIn: number; // status 'active'
  onBreak: number;
  completed: number;
  /** Tracked staff with no session and no approved leave on the date. */
  absent: number;
  onLeave: number;
}

export interface AttendanceOverview {
  summary: AttendanceSummary;
  late: LateRow[];
}

// ---------------------------------------------------------------------------
// One call for everything the dashboard's attendance band needs.
//
// This used to be eight REST calls in three waves: the summary fetched staff +
// sessions + leave, and the late figure fetched staff + rules + sessions, THEN
// staff_shift_assignments (it needed the staff ids), THEN shifts (it needed the
// shift ids). get_attendance_overview does the whole thing in one query, and
// because the summary and the late list now share a query key, React Query
// issues that one call once however many components ask for it.
//
// The RPC is SECURITY INVOKER, so what comes back is still scoped by the same
// row-level policies as the calls it replaces.
// ---------------------------------------------------------------------------

interface RawLate {
  staff_id: string;
  employee_id: string;
  full_name: string;
  scheduled_at: string;
  check_in_at: string;
  late_minutes: number;
}

const EMPTY_SUMMARY = (date: string): AttendanceSummary => ({
  date,
  totalTracked: 0,
  present: 0,
  checkedIn: 0,
  onBreak: 0,
  completed: 0,
  absent: 0,
  onLeave: 0,
});

export function attendanceOverviewKey(date: string, outletId?: string) {
  return ['attendance-overview', date, outletId ?? 'all'] as const;
}

export function useAttendanceOverview(date: string, outletId?: string, enabled = true) {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: attendanceOverviewKey(date, outletId),
    queryFn: async (): Promise<AttendanceOverview> => {
      const { data, error } = await supabase.rpc('get_attendance_overview', {
        _date: date,
        _outlet: outletId ?? null,
      });
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      return {
        summary: {
          date,
          totalTracked: Number(d.totalTracked ?? 0),
          present: Number(d.present ?? 0),
          checkedIn: Number(d.checkedIn ?? 0),
          onBreak: Number(d.onBreak ?? 0),
          completed: Number(d.completed ?? 0),
          absent: Number(d.absent ?? 0),
          onLeave: Number(d.onLeave ?? 0),
        },
        late: ((d.late ?? []) as RawLate[]).map((r) => ({
          staff_id: r.staff_id,
          employee_id: r.employee_id,
          full_name: r.full_name,
          scheduledISO: r.scheduled_at,
          checkInISO: r.check_in_at,
          lateMinutes: Number(r.late_minutes),
        })),
      };
    },
    enabled: enabled && !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    summary: q.data?.summary,
    late: q.data?.late ?? [],
    isLoading: q.isLoading,
    refetch: q.refetch,
    emptySummary: EMPTY_SUMMARY,
  };
}
