import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/query-keys';
import { format } from 'date-fns';

export interface DashboardStats {
  // Counts
  activeStaff: number;
  staffMissingSalary: number;
  pendingRequests: number;
  approvedRequests: number;
  pendingSalarySettlements: number;
  completedPaymentsToday: number;

  // Amounts
  totalPendingRequestsAmount: number;
  totalApprovedRequestsAmount: number;
  totalPendingSalaryAmount: number;
  advancesOutstanding: number;
  monthlyPayroll: number;
}

const EMPTY_STATS: DashboardStats = {
  activeStaff: 0,
  staffMissingSalary: 0,
  pendingRequests: 0,
  approvedRequests: 0,
  pendingSalarySettlements: 0,
  completedPaymentsToday: 0,
  totalPendingRequestsAmount: 0,
  totalApprovedRequestsAmount: 0,
  totalPendingSalaryAmount: 0,
  advancesOutstanding: 0,
  monthlyPayroll: 0,
};

async function fetchDashboardStats(withSalary: boolean): Promise<DashboardStats> {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Use head:true count queries wherever we only need a count + sum of amount.
  // Amount sums still need the rows, but these tables stay small (pending only).
  const [
    staffResult,
    missingSalaryResult,
    pendingRequestsResult,
    approvedRequestsResult,
    pendingSalariesResult,
    trialBalanceResult,
    completedTodayResult,
  ] = await Promise.all([
    // Active staff. Salary only fetched for salary-permitted roles.
    withSalary
      ? supabase.from('staff').select('id, monthly_salary, is_active').eq('is_active', true)
      : supabase.from('staff').select('id', { count: 'exact', head: true }).eq('is_active', true),

    // Active staff missing salary (count only).
    supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or('monthly_salary.is.null,monthly_salary.eq.0'),

    supabase.from('payment_requests').select('id, amount').eq('status', 'pending'),
    supabase
      .from('payment_requests')
      .select('id, amount')
      .eq('status', 'approved')
      .is('paid_at', null),

    withSalary
      ? supabase
          .from('salary_settlements')
          .select('id, balance_payable')
          .eq('status', 'pending')
      : Promise.resolve({ data: [] as Array<{ id: string; balance_payable: number }> }),

    // Single aggregated RPC instead of pulling all journal_lines rows.
    supabase.rpc('get_trial_balance'),

    // Count-only: completed payments today.
    supabase
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`),
  ]);

  // Active staff stats. Owner branch fetched rows (for payroll sum); admin branch is head-count.
  let activeStaffCount = 0;
  let monthlyPayroll = 0;
  if (withSalary) {
    const rows = (staffResult.data || []) as Array<{ monthly_salary?: number }>;
    activeStaffCount = rows.length;
    monthlyPayroll = rows.reduce((sum, s) => sum + Number(s.monthly_salary || 0), 0);
  } else {
    activeStaffCount = staffResult.count ?? 0;
  }

  const staffMissingSalary = missingSalaryResult.count ?? 0;

  const pendingRequests = pendingRequestsResult.data || [];
  const approvedRequests = approvedRequestsResult.data || [];
  const pendingSalaries = pendingSalariesResult.data || [];

  // Pull advances outstanding from the trial balance (account 1200: Staff Advances).
  let advancesOutstanding = 0;
  const tb = (trialBalanceResult.data || []) as Array<{ account_code: string; balance: number }>;
  const advanceRow = tb.find((r) => r.account_code === '1200');
  if (advanceRow) advancesOutstanding = Number(advanceRow.balance) || 0;

  return {
    activeStaff: activeStaffCount,
    staffMissingSalary,
    pendingRequests: pendingRequests.length,
    approvedRequests: approvedRequests.length,
    pendingSalarySettlements: pendingSalaries.length,
    completedPaymentsToday: completedTodayResult.count ?? 0,
    totalPendingRequestsAmount: pendingRequests.reduce((sum, r) => sum + Number(r.amount), 0),
    totalApprovedRequestsAmount: approvedRequests.reduce((sum, r) => sum + Number(r.amount), 0),
    totalPendingSalaryAmount: pendingSalaries.reduce((sum, s) => sum + Number(s.balance_payable || 0), 0),
    advancesOutstanding,
    monthlyPayroll,
  };
}

export function useDashboardStats() {
  const { user, canViewSalaries } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    // canViewSalaries is part of the key because the query branches on it (the
    // salary-settlements + payroll fetch). A permission change must produce a
    // distinct cache entry rather than serve stale non-salary data.
    queryKey: queryKeys.dashboardStats.byRole(canViewSalaries),
    queryFn: () => fetchDashboardStats(canViewSalaries),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return { stats: data ?? EMPTY_STATS, isLoading, refetch };
}
