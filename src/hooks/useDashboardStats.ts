import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/query-keys';

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
  // One RPC instead of seven parallel REST calls. The counts and sums are now
  // computed in Postgres rather than by pulling rows back to reduce() over
  // them — a round trip costs ~150 ms, and this screen was spending seven of
  // them to produce eleven numbers.
  //
  // get_dashboard_stats is SECURITY INVOKER: `withSalary` only decides whether
  // the payroll and settlement figures are COMPUTED, exactly as the client
  // branch did. It grants nothing — salary_settlements is still read as the
  // caller, so a user without the permission reads no rows either way.
  const { data, error } = await supabase.rpc('get_dashboard_stats', { _with_salary: withSalary });
  if (error) throw error;

  const d = (data ?? {}) as Record<string, unknown>;
  const num = (k: keyof DashboardStats): number => Number(d[k] ?? 0);

  return {
    activeStaff: num('activeStaff'),
    staffMissingSalary: num('staffMissingSalary'),
    pendingRequests: num('pendingRequests'),
    approvedRequests: num('approvedRequests'),
    pendingSalarySettlements: num('pendingSalarySettlements'),
    completedPaymentsToday: num('completedPaymentsToday'),
    totalPendingRequestsAmount: num('totalPendingRequestsAmount'),
    totalApprovedRequestsAmount: num('totalApprovedRequestsAmount'),
    totalPendingSalaryAmount: num('totalPendingSalaryAmount'),
    advancesOutstanding: num('advancesOutstanding'),
    monthlyPayroll: num('monthlyPayroll'),
  };
}

export function useDashboardStats() {
  const { user, canViewSalaries } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    // canViewSalaries is part of the key because the query branches on it (the
    // salary-settlements + payroll figures). A permission change must produce a
    // distinct cache entry rather than serve stale non-salary data.
    queryKey: queryKeys.dashboardStats.byRole(canViewSalaries),
    queryFn: () => fetchDashboardStats(canViewSalaries),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return { stats: data ?? EMPTY_STATS, isLoading, refetch };
}
