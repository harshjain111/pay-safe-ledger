import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

interface StaffRow {
  id: string;
  user_id: string | null;
}
interface SessionRow {
  staff_id: string | null;
  user_id: string | null;
  status: string;
}

/**
 * Live attendance roll-up for one date. Mirrors the Attendance page's data
 * model (attendance_sessions status active/on_break/completed, attendance-
 * tracked active staff, approved leave_records) so the numbers always agree.
 */
export function useAttendanceSummary(date: string) {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['attendanceSummary', date],
    queryFn: async (): Promise<AttendanceSummary> => {
      const [staffRes, sessRes, leaveRes] = await Promise.all([
        supabase
          .from('staff')
          .select('id, user_id')
          .eq('is_active', true)
          .eq('attendance_tracked', true),
        supabase
          .from('attendance_sessions' as never)
          .select('staff_id, user_id, status')
          .eq('work_date', date),
        supabase
          .from('leave_records')
          .select('staff_id')
          .eq('status', 'approved')
          .eq('leave_date', date),
      ]);

      const staff = ((staffRes.data as unknown as StaffRow[]) ?? []);
      const sessions = ((sessRes.data as unknown as SessionRow[]) ?? []);
      const leaves = ((leaveRes.data as unknown as Array<{ staff_id: string }>) ?? []);

      const presentKeys = new Set<string>();
      let checkedIn = 0;
      let onBreak = 0;
      let completed = 0;
      sessions.forEach((s) => {
        const key = s.staff_id ?? s.user_id;
        if (key) presentKeys.add(key);
        if (s.status === 'active') checkedIn++;
        else if (s.status === 'on_break') onBreak++;
        else if (s.status === 'completed') completed++;
      });

      const onLeaveSet = new Set(leaves.map((l) => l.staff_id));

      let absent = 0;
      let onLeave = 0;
      staff.forEach((st) => {
        const hasSession = presentKeys.has(st.id) || (st.user_id ? presentKeys.has(st.user_id) : false);
        if (hasSession) return;
        if (onLeaveSet.has(st.id)) onLeave++;
        else absent++;
      });

      return {
        date,
        totalTracked: staff.length,
        present: presentKeys.size,
        checkedIn,
        onBreak,
        completed,
        absent,
        onLeave,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return { summary: data, isLoading, refetch };
}
