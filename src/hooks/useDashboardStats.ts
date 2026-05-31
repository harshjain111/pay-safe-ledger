import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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

export function useDashboardStats() {
  const { user, isOwner } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
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
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user, isOwner]);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      const today = format(new Date(), 'yyyy-MM-dd');

      // Parallel fetches for all stats
      const [
        staffResult,
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
        // Active staff and missing salary
        supabase.from('staff').select('id, monthly_salary, is_active'),
        
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

      const staffData = staffResult.data || [];
      const activeStaff = staffData.filter((s) => s.is_active);
      const staffMissingSalary = activeStaff.filter((s) => !s.monthly_salary || s.monthly_salary === 0).length;
      const monthlyPayroll = activeStaff.reduce((sum, s) => sum + Number(s.monthly_salary || 0), 0);

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

      setStats({
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
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return { stats, isLoading, refetch: fetchStats };
}
