import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NotificationCounts {
  pendingRequests: number;
  pendingExpenses: number;
  approvedExpenses: number;
  unreadNotifications: number;
}

// Global refetch trigger for notification counts
let globalRefetch: (() => void) | null = null;

export function refetchNotificationCounts() {
  if (globalRefetch) {
    globalRefetch();
  }
}

export function useNotificationCounts() {
  const { user, userRole, isOwner, isAdmin, isAccountant, staffData } = useAuth();
  const [counts, setCounts] = useState<NotificationCounts>({
    pendingRequests: 0,
    pendingExpenses: 0,
    approvedExpenses: 0,
    unreadNotifications: 0,
  });

  const fetchCounts = useCallback(async () => {
    if (!user) return;

    try {
      // Unread notifications - always fetch
      const { data: notifications } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_read', false);

      // Pending requests - for Owner/Admin who can approve
      let pendingRequests = 0;
      if (isOwner || isAdmin) {
        const { data: requests } = await supabase
          .from('payment_requests')
          .select('id')
          .eq('status', 'pending');
        pendingRequests = requests?.length || 0;
      }

      // Pending expenses - for Owner/Admin who can approve
      let pendingExpenses = 0;
      if (isOwner || isAdmin) {
        const { data: expenses } = await supabase
          .from('expenses')
          .select('id')
          .eq('status', 'pending');
        pendingExpenses = expenses?.length || 0;
      }

      // Approved expenses - for Accountant who can reimburse
      let approvedExpenses = 0;
      if (isAccountant || isOwner || isAdmin) {
        const { data: expenses } = await supabase
          .from('expenses')
          .select('id')
          .eq('status', 'approved');
        approvedExpenses = expenses?.length || 0;
      }

      setCounts({
        pendingRequests,
        pendingExpenses,
        approvedExpenses,
        unreadNotifications: notifications?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching notification counts:', error);
    }
  }, [user, isOwner, isAdmin, isAccountant]);

  // Register global refetch function
  useEffect(() => {
    globalRefetch = fetchCounts;
    return () => {
      globalRefetch = null;
    };
  }, [fetchCounts]);

  useEffect(() => {
    if (!user) return;
    
    fetchCounts();
    
    // Set up real-time subscription for notifications
    const channel = supabase
      .channel('notification-counts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchCounts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_requests',
        },
        () => {
          fetchCounts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
        },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userRole, fetchCounts]);

  return { counts, refetch: fetchCounts };
}
