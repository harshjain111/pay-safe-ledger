import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/query-keys';

interface NotificationCounts {
  pendingRequests: number;
  /** Leave requests awaiting a decision — the Approve Leave badge. */
  pendingLeave: number;
  approvedAdvances: number;
  unreadNotifications: number;
}

const EMPTY: NotificationCounts = {
  pendingRequests: 0,
  pendingLeave: 0,
  approvedAdvances: 0,
  unreadNotifications: 0,
};

// ---------------------------------------------------------------------------
// AppLayout renders this hook TWICE (the desktop sidebar and the mobile nav),
// and it used to be plain useState + useEffect: both copies fired their own
// three queries and opened their own realtime channel, so the badges alone cost
// six requests per page load. Going through TanStack Query means both mounts
// share one in-flight request and one cached result, and the realtime channel
// is opened once and reference-counted below.
// ---------------------------------------------------------------------------

/** One shared realtime channel, opened on the first subscriber and closed on
 *  the last, so N mounts never mean N websocket subscriptions. */
let channel: ReturnType<typeof supabase.channel> | null = null;
let subscribers = 0;

function openChannel(userId: string, onChange: () => void) {
  subscribers += 1;
  if (!channel) {
    channel = supabase
      .channel('notification-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        onChange,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, onChange)
      .subscribe();
  }
  return () => {
    subscribers -= 1;
    if (subscribers <= 0 && channel) {
      supabase.removeChannel(channel);
      channel = null;
      subscribers = 0;
    }
  };
}

// Global refetch trigger, kept for callers outside React (advance approvals etc).
let globalRefetch: (() => void) | null = null;

export function refetchNotificationCounts() {
  globalRefetch?.();
}

async function fetchCounts(
  userId: string,
  wantsPending: boolean,
  wantsAdvances: boolean,
  wantsLeave: boolean,
): Promise<NotificationCounts> {
  // These are badge numbers, so ask the server to COUNT rather than ship every
  // matching row back to read .length off it — head:true sends no body at all.
  // They also go out together rather than in series: a round trip costs ~150 ms
  // from here, so three sequential awaits burn 450 ms of wall clock to produce
  // three integers.
  const [unreadRes, pendingRes, advancesRes, leaveRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),

    // Pending requests — for Owner/Admin who can approve.
    wantsPending
      ? supabase
          .from('payment_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 }),

    // Approved advances awaiting payout — for Accountant/Owner/Admin.
    wantsAdvances
      ? supabase
          .from('payment_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .is('paid_at', null)
      : Promise.resolve({ count: 0 }),

    // Leave awaiting a decision. RLS scopes it: a manager counts their own
    // reports, an owner counts everyone, so the badge matches the queue.
    wantsLeave
      ? supabase
          .from('leave_records')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
  ]);

  return {
    pendingRequests: pendingRes.count ?? 0,
    pendingLeave: leaveRes.count ?? 0,
    approvedAdvances: advancesRes.count ?? 0,
    unreadNotifications: unreadRes.count ?? 0,
  };
}

export function useNotificationCounts() {
  const { user, isOwner, isAdmin, isAccountant, can } = useAuth();
  const queryClient = useQueryClient();

  const wantsPending = isOwner || isAdmin;
  const wantsAdvances = isAccountant || isOwner || isAdmin;
  // Anyone who can decide leave gets the badge; can() short-circuits for owner.
  const wantsLeave = isOwner || can('leave.approve');
  const userId = user?.id ?? null;

  const { data, refetch } = useQuery({
    queryKey: queryKeys.notificationCounts.forUser(userId, wantsPending, wantsAdvances, wantsLeave),
    queryFn: () => fetchCounts(userId as string, wantsPending, wantsAdvances, wantsLeave),
    enabled: !!userId,
  });

  useEffect(() => {
    globalRefetch = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationCounts.all });
    };
    return () => { globalRefetch = null; };
  }, [queryClient]);

  useEffect(() => {
    if (!userId) return;
    // Invalidate rather than refetch directly: both mounts share the cache
    // entry, so one change produces one request, not one per mount.
    return openChannel(userId, () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationCounts.all });
    });
  }, [userId, queryClient]);

  return { counts: data ?? EMPTY, refetch };
}
