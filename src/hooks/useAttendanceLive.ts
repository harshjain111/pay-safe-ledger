import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Live attendance. When a terminal pushes a punch, api/device-push.ts writes
// attendance_sessions; Supabase Realtime tells every open browser, and screens
// refresh without anyone pressing reload.
//
// ONE channel for the whole app (mounted once in AppLayout via
// <AttendanceLiveSync />). Bursts are coalesced: a shift change at a busy
// outlet can bring dozens of punches in a minute, and each refresh is a query.
// ---------------------------------------------------------------------------

/** Fired on window after attendance changed; pages that keep their own state
 *  (not TanStack Query) listen for it with useOnAttendanceChange(). */
export const ATTENDANCE_CHANGED_EVENT = 'attendance:changed';

/** Query-key prefixes that read attendance and should refetch. */
const ATTENDANCE_QUERY_PREFIXES = ['attendance-overview', 'attendance-summary', 'attendance-report'];

const COALESCE_MS = 1500;

export function useAttendanceLiveSync(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      queryClient.invalidateQueries({
        predicate: (q) => {
          const head = q.queryKey[0];
          return typeof head === 'string' && ATTENDANCE_QUERY_PREFIXES.some((p) => head.startsWith(p));
        },
      });
      window.dispatchEvent(new Event(ATTENDANCE_CHANGED_EVENT));
    };

    const channel = supabase
      .channel('attendance-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, () => {
        if (!timer) timer = setTimeout(flush, COALESCE_MS);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

/** Run `onChange` whenever attendance changes (see useAttendanceLiveSync). */
export function useOnAttendanceChange(onChange: () => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(ATTENDANCE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ATTENDANCE_CHANGED_EVENT, handler);
  }, []);
}
