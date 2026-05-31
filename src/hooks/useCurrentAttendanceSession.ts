import { useCallback, useEffect, useState } from 'react';
import {
  AttendanceSession,
  getCurrentSession,
  getTodayCompletedSession,
} from '@/lib/attendance';

export function useCurrentAttendanceSession(userId: string | undefined) {
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [todayCompleted, setTodayCompleted] = useState<AttendanceSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const [open, done] = await Promise.all([
        getCurrentSession(userId),
        getTodayCompletedSession(userId),
      ]);
      setSession(open);
      setTodayCompleted(done);
      setError(null);
    } catch (e) {
      console.error('Attendance session load error', e);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { session, todayCompleted, isLoading, error, refresh };
}
