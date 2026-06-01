import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/query-keys';
import { format } from 'date-fns';

export interface DashboardStats {
  // Counts
  activeStaff: number;
  staffMissingSalary: number;
  pendingExpenses: number;
  pendingRequests: number;
  approvedExpenses: number;
  approvedRequests: number;
  pendingSalarySettlements: number;
  completedPaymentsToday: number;
  
  // Amounts
  totalPendingExpensesAmount: number;
  totalPendingRequestsAmount: number;
  totalApprovedExpensesAmount: number;
  totalApprovedRequestsAmount: number;
  totalPendingSalaryAmount: number;
  advancesOutstanding: number;
  monthlyPayroll: number;
}

const EMPTY_STATS: DashboardStats = {
  activeStaff: 0,
  staffMissingSalary: 0,
  pendingExpenses: 0,
  pendingRequests: 0,
  approvedExpenses: 0,
  approvedRequests: 0,
  pendingSalarySettlements: 0,
  completedPaymentsToday: 0,
  totalPendingExpensesAmount: 0,
  totalPendingRequestsAmount: 0,
  totalApprovedExpensesAmount: 0,
  totalApprovedRequestsAmount: 0,
  totalPendingSalaryAmount: 0,
  advancesOutstanding: 0,
  monthlyPayroll: 0,
};

async function fetchDashboardStats(isOwner: boolean): Promise<DashboardStats> {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Parallel fetches for all stats
  const [
    staffResult,
    missingSalaryResult,
    pendingExpensesResult,
    pendingRequestsResult,
    approvedExpensesResult,
    approvedRequestsResult,
    pendingSalariesResult,
    // CRITICAL: Separate queries for reliable account lookup
    accountsResult,
    journalLinesResult,
    completedTodayResult,
  ] = await Promise.all([
    // Active staff. Salary is owner-only and must never be sent to a non-owner
    // browser, so only owners pull monthly_salary here.
    isOwner
      ? supabase.from('staff').select('id, monthly_salary, is_active')
      : supabase.from('staff').select('id, is_active'),

    // Count of active staff missing a salary. A head/count query returns only a
    // number (no amounts), so admins keep their "missing salary" tile without
    // any compensation value leaving the database.
    supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or('monthly_salary.is.null,monthly_salary.eq.0'),

    // Pending expenses
    supabase.from('expenses').select('id, amount').eq('status', 'pending'),

    // Pending requests
    supabase.from('payment_requests').select('id, amount').eq('status', 'pending'),

    // Approved expenses (awaiting payout)
    supabase.from('expenses').select('id, amount').eq('status', 'approved'),

    // Approved requests (awaiting payout)
    supabase
      .from('payment_requests')
      .select('id, amount')
      .eq('status', 'approved')
      .is('paid_at', null),

    // Pending salary settlements (Owner only)
    isOwner
      ? supabase
          .from('salary_settlements')
          .select('id, balance_payable')
          .eq('status', 'pending')
      : Promise.resolve({ data: [] }),

    // CRITICAL FIX: Get accounts for lookup
    supabase
      .from('accounts')
      .select('id, code')
      .eq('code', '1200'), // Staff Advances account

    // Get all journal lines with staff_id
    supabase
      .from('journal_lines')
      .select('debit, credit, account_id')
      .not('staff_id', 'is', null),

    // Completed payments today (from journal_entries, not legacy ledger)
    supabase
      .from('journal_entries')
      .select('id')
      .gte('created_at', `${today}T00:00:00`),
  ]);

  const staffData = (staffResult.data || []) as Array<{
    id: string;
    is_active: boolean;
    monthly_salary?: number;
  }>;
  const activeStaff = staffData.filter((s) => s.is_active);
  // staffMissingSalary comes from the count-only query (no amounts), so it is
  // available to admins without shipping salary. monthlyPayroll is owner-only.
  const staffMissingSalary = missingSalaryResult.count ?? 0;
  const monthlyPayroll = isOwner
    ? activeStaff.reduce((sum, s) => sum + Number(s.monthly_salary || 0), 0)
    : 0;

  const pendingExpenses = pendingExpensesResult.data || [];
  const pendingRequests = pendingRequestsResult.data || [];
  const approvedExpenses = approvedExpensesResult.data || [];
  const approvedRequests = approvedRequestsResult.data || [];
  const pendingSalaries = pendingSalariesResult.data || [];
  const completedToday = completedTodayResult.data || [];

  // Build account code lookup map
  const accountCodeMap = new Map<string, string>();
  (accountsResult.data || []).forEach((acc: any) => {
    accountCodeMap.set(acc.id, acc.code);
  });

  // Calculate advances outstanding from journal_lines (SINGLE SOURCE OF TRUTH)
  // Staff Advances account (1200): Debit = given, Credit = adjusted/cleared
  let totalAdvanceDebit = 0;
  let totalAdvanceCredit = 0;

  (journalLinesResult.data || []).forEach((line: any) => {
    const accountCode = accountCodeMap.get(line.account_id);
    if (accountCode === '1200') { // Staff Advances account
      totalAdvanceDebit += Number(line.debit) || 0;
      totalAdvanceCredit += Number(line.credit) || 0;
    }
  });

  const advancesOutstanding = totalAdvanceDebit - totalAdvanceCredit;

  return {
    activeStaff: activeStaff.length,
    staffMissingSalary,
    pendingExpenses: pendingExpenses.length,
    pendingRequests: pendingRequests.length,
    approvedExpenses: approvedExpenses.length,
    approvedRequests: approvedRequests.length,
    pendingSalarySettlements: pendingSalaries.length,
    completedPaymentsToday: completedToday.length,
    totalPendingExpensesAmount: pendingExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
    totalPendingRequestsAmount: pendingRequests.reduce((sum, r) => sum + Number(r.amount), 0),
    totalApprovedExpensesAmount: approvedExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
    totalApprovedRequestsAmount: approvedRequests.reduce((sum, r) => sum + Number(r.amount), 0),
    totalPendingSalaryAmount: pendingSalaries.reduce((sum, s) => sum + Number(s.balance_payable || 0), 0),
    advancesOutstanding,
    monthlyPayroll,
  };
}

export function useDashboardStats() {
  const { user, isOwner } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    // isOwner is part of the key because the query branches on it (the
    // owner-only salary-settlements fetch). A role change must produce a
    // distinct cache entry rather than serve stale non-owner data.
    queryKey: queryKeys.dashboardStats.byRole(isOwner),
    queryFn: () => fetchDashboardStats(isOwner),
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return { stats: data ?? EMPTY_STATS, isLoading, refetch };
}
