/**
 * Single Source of Truth: Staff Balance Hook
 * 
 * This hook calculates staff balance EXCLUSIVELY from journal_lines.
 * All balance displays (Admin Ledger, Staff Dashboard, Widgets) MUST use this hook.
 * 
 * Formula: Staff Balance = (Payable Cr - Payable Dr) - (Advance Dr - Advance Cr)
 * - Positive balance = Company owes staff
 * - Negative balance = Staff owes company (outstanding advance)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StaffBalanceData {
  // Net balance (positive = company owes staff, negative = staff owes company)
  netBalance: number;
  
  // Component breakdowns
  payableBalance: number;   // Staff Payable: Cr - Dr (what company owes)
  advanceBalance: number;   // Staff Advances: Dr - Cr (what staff owes)
  
  // Raw totals for display
  payableCredit: number;
  payableDebit: number;
  advanceDebit: number;
  advanceCredit: number;
  
  // Derived values for UI
  advanceOutstanding: number;  // Positive if staff owes company
  salaryPayable: number;       // Positive if company owes staff (net of advances)
  
  isLoading: boolean;
  error: string | null;
}

export function useStaffBalance(staffId: string | null | undefined): StaffBalanceData {
  const [data, setData] = useState<StaffBalanceData>({
    netBalance: 0,
    payableBalance: 0,
    advanceBalance: 0,
    payableCredit: 0,
    payableDebit: 0,
    advanceDebit: 0,
    advanceCredit: 0,
    advanceOutstanding: 0,
    salaryPayable: 0,
    isLoading: true,
    error: null,
  });

  const fetchBalance = useCallback(async () => {
    if (!staffId) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // CRITICAL: Use SECURITY DEFINER RPC functions for Staff users
      // Staff cannot read accounts table due to RLS, so we use the server-side functions
      const [advancesResult, payableResult] = await Promise.all([
        supabase.rpc('get_staff_advances_from_journals', { _staff_id: staffId }),
        supabase.rpc('get_staff_payable_from_journals', { _staff_id: staffId }),
      ]);

      if (advancesResult.error) throw advancesResult.error;
      if (payableResult.error) throw payableResult.error;

      // advanceBalance = outstanding advances (positive = staff owes company)
      const advanceBalance = Number(advancesResult.data) || 0;
      
      // payableBalance = salary/expense payable (positive = company owes staff)
      const payableBalance = Number(payableResult.data) || 0;
      
      // Net Staff Balance = What we owe them - What they owe us
      const netBalance = payableBalance - advanceBalance;
      
      console.log('[useStaffBalance] Staff:', staffId, 
        'Advances:', advanceBalance, 'Payable:', payableBalance, 'Net:', netBalance);
      
      // Derived values for UI
      const advanceOutstanding = Math.max(0, advanceBalance); // Only show positive (they owe us)
      const salaryPayable = Math.max(0, netBalance); // Only show positive (we owe them)

      setData({
        netBalance,
        payableBalance,
        advanceBalance,
        payableCredit: payableBalance > 0 ? payableBalance : 0,
        payableDebit: payableBalance < 0 ? Math.abs(payableBalance) : 0,
        advanceDebit: advanceBalance > 0 ? advanceBalance : 0,
        advanceCredit: advanceBalance < 0 ? Math.abs(advanceBalance) : 0,
        advanceOutstanding,
        salaryPayable,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      console.error('Error fetching staff balance:', err);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || 'Failed to fetch balance',
      }));
    }
  }, [staffId]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return data;
}

/**
 * Hook to get multiple staff balances at once (for Admin views)
 */
export function useAllStaffBalances() {
  const [balances, setBalances] = useState<Map<string, StaffBalanceData>>(new Map());
  const [aggregateBalance, setAggregateBalance] = useState({
    netBalance: 0,
    totalPayable: 0,
    totalAdvances: 0,
    isLoading: true,
    error: null as string | null,
  });

  const fetchAllBalances = useCallback(async () => {
    try {
      // Step 1: Get all account codes in a simple lookup map
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code')
        .in('code', ['1200', '2000']); // Staff Advances and Staff Payable
      
      if (accountsError) throw accountsError;
      
      const accountCodeMap = new Map<string, string>();
      (accounts || []).forEach(acc => {
        accountCodeMap.set(acc.id, acc.code);
      });

      // Step 2: Query ALL staff journal lines
      const { data: lines, error } = await supabase
        .from('journal_lines')
        .select('staff_id, debit, credit, account_id')
        .not('staff_id', 'is', null);

      if (error) throw error;

      // Group by staff and calculate balances
      const staffMap = new Map<string, {
        payableCredit: number;
        payableDebit: number;
        advanceDebit: number;
        advanceCredit: number;
      }>();

      (lines || []).forEach((line: any) => {
        if (!line.staff_id) return;
        
        const existing = staffMap.get(line.staff_id) || {
          payableCredit: 0,
          payableDebit: 0,
          advanceDebit: 0,
          advanceCredit: 0,
        };

        // Look up account code from our map
        const code = accountCodeMap.get(line.account_id);
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;

        if (code === '2000') {
          existing.payableCredit += credit;
          existing.payableDebit += debit;
        } else if (code === '1200') {
          existing.advanceDebit += debit;
          existing.advanceCredit += credit;
        }

        staffMap.set(line.staff_id, existing);
      });

      // Convert to balance data
      const newBalances = new Map<string, StaffBalanceData>();
      let totalNetBalance = 0;
      let totalPayable = 0;
      let totalAdvances = 0;

      staffMap.forEach((data, staffId) => {
        const payableBalance = data.payableCredit - data.payableDebit;
        const advanceBalance = data.advanceDebit - data.advanceCredit;
        const netBalance = payableBalance - advanceBalance;

        newBalances.set(staffId, {
          netBalance,
          payableBalance,
          advanceBalance,
          payableCredit: data.payableCredit,
          payableDebit: data.payableDebit,
          advanceDebit: data.advanceDebit,
          advanceCredit: data.advanceCredit,
          advanceOutstanding: Math.max(0, advanceBalance),
          salaryPayable: Math.max(0, netBalance),
          isLoading: false,
          error: null,
        });

        totalNetBalance += netBalance;
        totalPayable += payableBalance;
        totalAdvances += advanceBalance;
      });

      setBalances(newBalances);
      setAggregateBalance({
        netBalance: totalNetBalance,
        totalPayable,
        totalAdvances,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      console.error('Error fetching all staff balances:', err);
      setAggregateBalance(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || 'Failed to fetch balances',
      }));
    }
  }, []);

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  return { balances, aggregateBalance, refetch: fetchAllBalances };
}
