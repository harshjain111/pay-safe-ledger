import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toAmount } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { ListSkeleton } from '@/components/layout/ListSkeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, Download, ArrowDownRight, ArrowUpRight, Scale, Lock, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import type { StaffPublic } from '@/types/database';
import { RectificationDialog } from '@/components/ledger/RectificationDialog';

interface JournalLineWithDetails {
  id: string;
  debit: number;
  credit: number;
  description: string | null;
  staff_id: string | null;
  created_at: string;
  running_balance?: number;
  journal_entry: {
    id: string;
    entry_date: string;
    reference_no: string;
    description: string;
    transaction_type: string;
    is_legacy: boolean;
    is_immutable: boolean;
    paid_by_user_name: string | null;
  } | null;
  account: {
    code: string;
    name: string;
    account_type: string;
  } | null;
}

interface StaffBalance {
  staffId: string;
  staffName: string;
  debit: number;
  credit: number;
  balance: number;
  // Per-account breakdown for accurate balance calculation
  payableDebit: number;
  payableCredit: number;
  advanceDebit: number;
  advanceCredit: number;
}

export default function Ledger() {
  const [searchParams] = useSearchParams();
  const { user, isOwner, isAdmin, isStaff, isCA, staffData, isAccountant, accountingMode } = useAuth();
  
  const [journalLines, setJournalLines] = useState<JournalLineWithDetails[]>([]);
  const [staffList, setStaffList] = useState<StaffPublic[]>([]);
  const [staffBalances, setStaffBalances] = useState<StaffBalance[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>(
    searchParams.get('staff') || 'all'
  );
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [rectificationTarget, setRectificationTarget] = useState<{
    journalEntryId: string;
    referenceNo: string;
    description: string;
    transactionType: string;
    staffId: string;
    staffName: string;
    lines: any[];
  } | null>(null);

  // Calculate totals from journal lines - ONLY staff-side entries (staff_id IS NOT NULL)
  // Also calculate per-account totals for proper balance formula
  const totals = journalLines.reduce(
    (acc, line) => {
      if (line.staff_id && line.account) {
        const accountCode = line.account.code;
        return {
          debit: acc.debit + toAmount(line.debit),
          credit: acc.credit + toAmount(line.credit),
          payableDebit: acc.payableDebit + (accountCode === '2000' ? toAmount(line.debit) : 0),
          payableCredit: acc.payableCredit + (accountCode === '2000' ? toAmount(line.credit) : 0),
          advanceDebit: acc.advanceDebit + (accountCode === '1200' ? toAmount(line.debit) : 0),
          advanceCredit: acc.advanceCredit + (accountCode === '1200' ? toAmount(line.credit) : 0),
        };
      }
      return acc;
    },
    { debit: 0, credit: 0, payableDebit: 0, payableCredit: 0, advanceDebit: 0, advanceCredit: 0 }
  );

  // For "All Staff" view: calculate as SUM of individual staff balances
  // For individual staff: use account-based formula
  // Staff Balance = (Payable Cr - Payable Dr) - (Advance Dr - Advance Cr)
  const closingBalance = selectedStaff === 'all' 
    ? staffBalances.reduce((sum, sb) => sum + sb.balance, 0)
    : (totals.payableCredit - totals.payableDebit) - (totals.advanceDebit - totals.advanceCredit);

  // Validation: ensure individual balances sum to the aggregate "All Staff" balance
  useEffect(() => {
    if (selectedStaff === 'all' && staffBalances.length > 0) {
      const sumOfIndividual = staffBalances.reduce((sum, sb) => sum + sb.balance, 0);
      // For aggregate, recalculate using account-based formula
      const aggregatePayableBalance = totals.payableCredit - totals.payableDebit;
      const aggregateAdvanceBalance = totals.advanceDebit - totals.advanceCredit;
      const directCalculation = aggregatePayableBalance - aggregateAdvanceBalance;
      
      // Allow small rounding difference
      if (Math.abs(sumOfIndividual - directCalculation) > 0.01) {
        console.error('Balance validation failed:', {
          sumOfIndividual,
          directCalculation,
          difference: sumOfIndividual - directCalculation,
          aggregatePayableBalance,
          aggregateAdvanceBalance,
        });
        setValidationError(`Balance mismatch: Individual sum (₹${sumOfIndividual.toLocaleString('en-IN')}) ≠ Aggregate (₹${directCalculation.toLocaleString('en-IN')})`);
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  }, [staffBalances, totals, selectedStaff]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setValidationError(null);
    try {
      // Fetch staff list (for filter dropdown)
      if (isOwner || isAdmin || (isAccountant && accountingMode) || isCA) {
        const { data: staffListData, error: staffError } = await supabase
          .from('staff_public')
          .select('*')
          .order('full_name');

        if (staffError) throw staffError;
        setStaffList(staffListData as StaffPublic[] || []);
      }

      // Determine staff filter
      let staffIdFilter: string | null = null;
      if (isStaff || (isAccountant && !accountingMode)) {
        if (staffData?.id) {
          staffIdFilter = staffData.id;
        } else {
          setJournalLines([]);
          setStaffBalances([]);
          setIsLoading(false);
          return;
        }
      } else if (selectedStaff !== 'all') {
        staffIdFilter = selectedStaff;
      }

      // CRITICAL: Only fetch journal_lines WHERE staff_id IS NOT NULL
      // This ensures we only see staff-side entries, not Bank/Cash/Expense accounts
      let query = supabase
        .from('journal_lines')
        .select(`
          id,
          debit,
          credit,
          description,
          staff_id,
          created_at,
          journal_entry:journal_entry_id(
            id,
            entry_date,
            reference_no,
            description,
            transaction_type,
            is_legacy,
            is_immutable,
            paid_by_user_name
          ),
          account:account_id(
            code,
            name,
            account_type
          )
        `)
        .not('staff_id', 'is', null) // CRITICAL: Exclude non-staff journal lines
        .order('created_at', { ascending: true });

      if (staffIdFilter) {
        query = query.eq('staff_id', staffIdFilter);
      }

      const { data: linesData, error: linesError } = await query;

      if (linesError) throw linesError;

      // Calculate per-staff balances for validation and "All Staff" view
      // CRITICAL: Use account-based calculation for accurate balance
      // Staff Balance = (Payable Cr - Payable Dr) - (Advance Dr - Advance Cr)
      // Positive = Company owes staff, Negative = Staff owes company
      const staffBalanceMap = new Map<string, {
        debit: number;
        credit: number;
        payableDebit: number;
        payableCredit: number;
        advanceDebit: number;
        advanceCredit: number;
      }>();
      
      (linesData || []).forEach(line => {
        if (line.staff_id && line.account) {
          const existing = staffBalanceMap.get(line.staff_id) || {
            debit: 0,
            credit: 0,
            payableDebit: 0,
            payableCredit: 0,
            advanceDebit: 0,
            advanceCredit: 0
          };
          
          const accountCode = line.account.code;
          const debit = toAmount(line.debit);
          const credit = toAmount(line.credit);
          
          const updated = {
            debit: existing.debit + debit,
            credit: existing.credit + credit,
            payableDebit: existing.payableDebit + (accountCode === '2000' ? debit : 0),
            payableCredit: existing.payableCredit + (accountCode === '2000' ? credit : 0),
            advanceDebit: existing.advanceDebit + (accountCode === '1200' ? debit : 0),
            advanceCredit: existing.advanceCredit + (accountCode === '1200' ? credit : 0),
          };
          
          staffBalanceMap.set(line.staff_id, updated);
        }
      });

      // Build staff balances array with correct formula
      const balances: StaffBalance[] = [];
      staffBalanceMap.forEach((value, staffId) => {
        const staffInfo = staffList.find(s => s.id === staffId);
        // Net Staff Balance = (Payable Credits - Payable Debits) - (Advance Debits - Advance Credits)
        // Payable: Cr means we owe staff, Dr means we've paid
        // Advance: Dr means staff owes us, Cr means advance was cleared
        const payableBalance = value.payableCredit - value.payableDebit; // Positive = we owe staff
        const advanceBalance = value.advanceDebit - value.advanceCredit; // Positive = staff owes us
        const netBalance = payableBalance - advanceBalance; // Net outstanding
        
        balances.push({
          staffId,
          staffName: staffInfo?.full_name || 'Unknown',
          debit: value.debit,
          credit: value.credit,
          balance: netBalance,
          payableDebit: value.payableDebit,
          payableCredit: value.payableCredit,
          advanceDebit: value.advanceDebit,
          advanceCredit: value.advanceCredit,
        });
      });
      setStaffBalances(balances);

      // Calculate running balance for display using correct formula per account type
      // Running balance tracks: (Payable Cr - Payable Dr) - (Advance Dr - Advance Cr)
      let runningPayableCr = 0;
      let runningPayableDr = 0;
      let runningAdvanceDr = 0;
      let runningAdvanceCr = 0;
      
      const linesWithBalance = (linesData || []).map(line => {
        if (line.staff_id && line.account) {
          const accountCode = line.account.code;
          const debit = toAmount(line.debit);
          const credit = toAmount(line.credit);
          
          if (accountCode === '2000') { // Staff Payable
            runningPayableDr += debit;
            runningPayableCr += credit;
          } else if (accountCode === '1200') { // Staff Advances
            runningAdvanceDr += debit;
            runningAdvanceCr += credit;
          }
        }
        // Running balance = (Payable Cr - Payable Dr) - (Advance Dr - Advance Cr)
        const runningBalance = (runningPayableCr - runningPayableDr) - (runningAdvanceDr - runningAdvanceCr);
        return { ...line, running_balance: runningBalance };
      }) as JournalLineWithDetails[];

      setJournalLines(linesWithBalance);
    } catch (error) {
      console.error('Error fetching ledger data:', error);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staffList is set within fetchData; listing it would cause an infinite refetch loop
  }, [selectedStaff, selectedMonth, staffData?.id, accountingMode, isOwner, isAdmin, isAccountant, isCA, isStaff]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate month options
  const generateMonthOptions = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy'),
      });
    }
    return months;
  };

  const canFilterByStaff = isOwner || isAdmin || (isAccountant && accountingMode) || isCA;
  const selectedStaffName = staffList.find(s => s.id === selectedStaff)?.full_name;

  // Transaction type display labels
  const getTransactionTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'salary_settlement': 'Salary Accrual',
      'salary_payout': 'Salary Payment',
      'expense_approval': 'Expense Approved',
      'expense_payout': 'Expense Reimbursed',
      'advance_paid': 'Advance Given',
      'advance_adjustment': 'Advance Adjusted',
      'rectification': 'Rectification',
    };
    return labels[type] || type;
  };

  const getTransactionTypeBadgeVariant = (type: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    if (type === 'rectification') return 'destructive';
    if (type.includes('payout') || type.includes('paid')) return 'default';
    if (type.includes('settlement') || type.includes('approval')) return 'secondary';
    return 'outline';
  };

  // Helper to open rectification dialog for a journal entry
  const handleRectify = (line: JournalLineWithDetails) => {
    if (!line.journal_entry || !line.staff_id) return;
    const staffInfo = staffList.find(s => s.id === line.staff_id);
    
    // Collect all lines for this journal entry from journalLines
    const entryLines = journalLines.filter(
      l => l.journal_entry?.id === line.journal_entry?.id
    );

    setRectificationTarget({
      journalEntryId: line.journal_entry.id,
      referenceNo: line.journal_entry.reference_no,
      description: line.journal_entry.description,
      transactionType: line.journal_entry.transaction_type,
      staffId: line.staff_id,
      staffName: staffInfo?.full_name || 'Unknown',
      lines: entryLines.map(l => ({
        id: l.id,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        staff_id: l.staff_id,
        account: l.account,
      })),
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Ledger"
        description={
          isStaff || (isAccountant && !accountingMode)
            ? "Your personal ledger"
            : selectedStaff !== 'all'
            ? `Ledger for ${selectedStaffName}`
            : "Staff-wise ledger entries"
        }
      >
        <Button variant="outline" className="rounded-xl text-xs sm:text-sm px-2 sm:px-4">
          <Download className="mr-1 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </PageHeader>

      {/* Filters */}
      <Card className="rounded-2xl shadow-card border-0">
        <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            {canFilterByStaff && (
              <div className="w-full sm:w-64">
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="rounded-xl text-sm">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl bg-popover">
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id || ''}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-full sm:w-48">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="rounded-xl text-sm">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent className="rounded-xl bg-popover">
                  <SelectItem value="all">All Months</SelectItem>
                  {generateMonthOptions().map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Error Alert */}
      {validationError && (
        <Card className="rounded-xl border-destructive bg-destructive/10">
          <CardContent className="p-3 sm:p-4">
            <p className="text-destructive text-sm font-medium">⚠️ {validationError}</p>
            <p className="text-destructive/80 text-xs mt-1">Please contact support - balance reconciliation failed.</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards - Mobile Optimized */}
      <div className="grid gap-2 sm:gap-5 grid-cols-3">
        <Card className="rounded-xl sm:rounded-2xl shadow-card border-0 overflow-hidden">
          <CardContent className="p-2 sm:p-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-1 sm:gap-2 mb-1">
                <div className="p-1 sm:p-2 rounded-lg bg-warning/10">
                  <ArrowDownRight className="h-3 w-3 sm:h-5 sm:w-5 text-warning" />
                </div>
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {selectedStaff === 'all' ? 'Staff Debits' : 'Debits'}
              </span>
              <span className="text-sm sm:text-xl font-bold font-mono truncate">
                ₹{totals.debit.toLocaleString('en-IN')}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="rounded-xl sm:rounded-2xl shadow-card border-0 overflow-hidden">
          <CardContent className="p-2 sm:p-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-1 sm:gap-2 mb-1">
                <div className="p-1 sm:p-2 rounded-lg bg-success/10">
                  <ArrowUpRight className="h-3 w-3 sm:h-5 sm:w-5 text-success" />
                </div>
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {selectedStaff === 'all' ? 'Staff Credits' : 'Credits'}
              </span>
              <span className="text-sm sm:text-xl font-bold font-mono truncate">
                ₹{totals.credit.toLocaleString('en-IN')}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="rounded-xl sm:rounded-2xl shadow-card border-0 overflow-hidden">
          <CardContent className="p-2 sm:p-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-1 sm:gap-2 mb-1">
                <div className={`p-1 sm:p-2 rounded-lg ${closingBalance >= 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                  <Scale className={`h-3 w-3 sm:h-5 sm:w-5 ${closingBalance >= 0 ? 'text-primary' : 'text-destructive'}`} />
                </div>
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {selectedStaff === 'all' ? 'Net Outstanding' : 'Balance'}
              </span>
              <span className={`text-sm sm:text-xl font-bold font-mono truncate ${closingBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                ₹{Math.abs(closingBalance).toLocaleString('en-IN')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Balance Explanation with Helper Text */}
      <div className="px-1 space-y-1">
        <div className="text-xs text-muted-foreground">
          {closingBalance > 0 ? (
            <span className="text-success">↑ Company owes staff ₹{closingBalance.toLocaleString('en-IN')}</span>
          ) : closingBalance < 0 ? (
            <span className="text-warning">↓ Staff owes company ₹{Math.abs(closingBalance).toLocaleString('en-IN')}</span>
          ) : (
            <span className="text-success">✓ Ledger balanced - no outstanding</span>
          )}
        </div>
        {selectedStaff === 'all' && (
          <p className="text-[10px] text-muted-foreground/70">
            Staff Sub-Ledger: Shows only staff receivables/payables. Bank & expense accounts excluded.
          </p>
        )}
      </div>

      {/* Ledger Table */}
      <Card className="rounded-2xl shadow-card border-0 overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <ListSkeleton variant="rows" />
          ) : journalLines.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No entries found"
              description="Ledger entries will appear here once transactions are recorded"
            />
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block lg:hidden divide-y">
                {journalLines.map((line) => (
                  <div key={line.id} className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                          <Badge 
                            variant={getTransactionTypeBadgeVariant(line.journal_entry?.transaction_type || '')}
                            className="text-[10px] sm:text-xs"
                          >
                            {getTransactionTypeLabel(line.journal_entry?.transaction_type || '')}
                          </Badge>
                          {line.journal_entry?.is_immutable && (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-xs sm:text-sm line-clamp-2">
                          {line.description || line.journal_entry?.description}
                        </p>
                        {line.journal_entry?.paid_by_user_name && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Paid by: {line.journal_entry.paid_by_user_name}
                          </p>
                        )}
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                          {line.journal_entry?.entry_date ? format(new Date(line.journal_entry.entry_date), 'dd MMM') : '-'} • {line.journal_entry?.reference_no}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {line.account?.name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {line.debit > 0 ? (
                          <span className="text-destructive font-medium font-mono text-xs sm:text-sm">
                            -₹{toAmount(line.debit).toLocaleString('en-IN')}
                          </span>
                        ) : line.credit > 0 ? (
                          <span className="text-success font-medium font-mono text-xs sm:text-sm">
                            +₹{toAmount(line.credit).toLocaleString('en-IN')}
                          </span>
                        ) : null}
                        <p className={`text-[10px] sm:text-xs font-mono mt-0.5 ${
                          (line.running_balance || 0) >= 0 ? 'text-success' : 'text-destructive'
                        }`}>
                          Bal: ₹{Math.abs(line.running_balance || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                     </div>
                    {/* Rectify button for owner on non-rectification entries */}
                    {isOwner && line.journal_entry?.transaction_type !== 'rectification' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-warning h-6 px-2 mt-1"
                        onClick={() => handleRectify(line)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Rectify
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Reference</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Account</TableHead>
                      <TableHead className="font-semibold max-w-[200px]">Description</TableHead>
                      <TableHead className="font-semibold">Paid By</TableHead>
                      <TableHead className="font-semibold text-right">Debit</TableHead>
                      <TableHead className="font-semibold text-right">Credit</TableHead>
                      <TableHead className="font-semibold text-right">Balance</TableHead>
                      {isOwner && <TableHead className="font-semibold w-[80px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalLines.map((line) => (
                      <TableRow key={line.id} className="group">
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {line.journal_entry?.entry_date ? format(new Date(line.journal_entry.entry_date), 'dd MMM yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs px-2 py-1 rounded-md bg-muted/50">
                            {line.journal_entry?.reference_no || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={getTransactionTypeBadgeVariant(line.journal_entry?.transaction_type || '')}
                            className="text-xs"
                          >
                            {getTransactionTypeLabel(line.journal_entry?.transaction_type || '')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{line.account?.name}</span>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="truncate block text-sm" title={line.description || line.journal_entry?.description || ''}>
                            {line.description || line.journal_entry?.description}
                          </span>
                        </TableCell>
                        <TableCell>
                          {line.journal_entry?.paid_by_user_name ? (
                            <span className="text-sm text-muted-foreground">
                              {line.journal_entry.paid_by_user_name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {line.debit > 0 ? (
                            <span className="text-destructive font-medium">
                              ₹{toAmount(line.debit).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {line.credit > 0 ? (
                            <span className="text-success font-medium">
                              ₹{toAmount(line.credit).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-medium">
                          <span className={(line.running_balance || 0) >= 0 ? 'text-success' : 'text-destructive'}>
                            {(line.running_balance || 0) >= 0 ? '+' : '-'}₹{Math.abs(line.running_balance || 0).toLocaleString('en-IN')}
                          </span>
                        </TableCell>
                        {isOwner && (
                          <TableCell>
                            {line.journal_entry?.transaction_type !== 'rectification' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-warning h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleRectify(line)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Rectify
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Rectification Dialog */}
      {rectificationTarget && user && (
        <RectificationDialog
          open={!!rectificationTarget}
          onOpenChange={(open) => !open && setRectificationTarget(null)}
          journalEntryId={rectificationTarget.journalEntryId}
          referenceNo={rectificationTarget.referenceNo}
          description={rectificationTarget.description}
          transactionType={rectificationTarget.transactionType}
          staffId={rectificationTarget.staffId}
          staffName={rectificationTarget.staffName}
          lines={rectificationTarget.lines}
          userId={user.id}
          onSuccess={() => {
            setRectificationTarget(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
