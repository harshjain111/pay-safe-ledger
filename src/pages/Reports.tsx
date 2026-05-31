import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Amount } from '@/components/ui/amount';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart3, Download, CalendarIcon, FileSpreadsheet, FileText, Users, Wallet,
  ArrowUpRight, Receipt, FileDown, Scale, Sparkles, ListOrdered,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { cn, toAmount } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  exportLedgerPDF, exportSalaryRegisterPDF, exportPaymentRegisterPDF,
  exportExpenseReportPDF, exportAdvanceReportPDF, exportSummaryPDF,
} from '@/lib/pdf-export';
import { TrialBalance } from '@/components/reports/TrialBalance';
import { ExpenseExplorer } from '@/components/reports/ExpenseExplorer';
import { AdvanceExplorer } from '@/components/reports/AdvanceExplorer';
import { TransactionsExplorer } from '@/components/reports/TransactionsExplorer';
import { AIInsights } from '@/components/reports/AIInsights';
import type { Staff } from '@/types/database';

type ReportType = 'expenses' | 'advances' | 'transactions' | 'ai_insights' | 'summary' | 'trial_balance' | 'ledger' | 'salary' | 'payment';

interface DateRange { from: Date; to: Date; }

export default function Reports() {
  const navigate = useNavigate();
  const { isOwner, isCA, isAccountant, isAdmin, canViewSalaries } = useAuth();
  const canSeeSalaryReports = canViewSalaries;

  const [activeReport, setActiveReport] = useState<ReportType>('expenses');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 1)),
    to: endOfMonth(new Date()),
  });
  const [reportData, setReportData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [summaryStats, setSummaryStats] = useState({
    totalPayroll: 0, totalAdvances: 0, totalExpenses: 0, totalPayments: 0, staffCount: 0,
  });

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase.from('staff_public').select('*').order('full_name');
    setStaff(data as Staff[] || []);
  }, []);

  const fetchSummaryReport = useCallback(async () => {
    const [staffData, settlements, advances, expenses] = await Promise.all([
      supabase.from('staff').select('id, monthly_salary').eq('is_active', true),
      supabase.from('salary_settlements').select('balance_payable').eq('settlement_month', selectedMonth).eq('status', 'settled'),
      supabase.from('ledger_entries').select('debit, credit').eq('tag', 'advance').gte('entry_date', `${selectedMonth}-01`).lte('entry_date', `${selectedMonth}-31`),
      supabase.from('expenses').select('amount').eq('status', 'reimbursed').gte('expense_date', `${selectedMonth}-01`).lte('expense_date', `${selectedMonth}-31`),
    ]);

    setSummaryStats({
      totalPayroll: staffData.data?.reduce((sum, s) => sum + toAmount(s.monthly_salary), 0) || 0,
      totalAdvances: advances.data?.reduce((sum, a) => sum + toAmount(a.debit) - toAmount(a.credit), 0) || 0,
      totalExpenses: expenses.data?.reduce((sum, e) => sum + toAmount(e.amount), 0) || 0,
      totalPayments: settlements.data?.reduce((sum, s) => sum + toAmount(s.balance_payable), 0) || 0,
      staffCount: staffData.data?.length || 0,
    });
  }, [selectedMonth]);

  const fetchLedgerReport = useCallback(async () => {
    let query = supabase
      .from('journal_lines')
      .select(`
        id, debit, credit, description, staff_id, created_at,
        journal_entry:journal_entry_id(id, entry_date, reference_no, description, transaction_type, is_immutable, paid_by_user_name),
        account:account_id(code, name, account_type)
      `)
      .not('staff_id', 'is', null)
      .order('created_at', { ascending: true });

    if (selectedStaffId !== 'all') query = query.eq('staff_id', selectedStaffId);

    const { data, error } = await query;
    if (error) throw error;

    // Filter by date range using journal_entry.entry_date
    const fromStr = format(dateRange.from, 'yyyy-MM-dd');
    const toStr = format(dateRange.to, 'yyyy-MM-dd');
    const filtered = (data || []).filter((line: any) => {
      const entryDate = line.journal_entry?.entry_date;
      return entryDate && entryDate >= fromStr && entryDate <= toStr;
    });
    setReportData(filtered);
  }, [selectedStaffId, dateRange]);

  const fetchSalaryReport = useCallback(async () => {
    let query = supabase.from('salary_settlements').select('*, staff:staff_public(full_name, employee_id)')
      .eq('settlement_month', selectedMonth).order('created_at', { ascending: false });
    if (selectedStaffId !== 'all') query = query.eq('staff_id', selectedStaffId);
    const { data, error } = await query;
    if (error) throw error;
    setReportData(data || []);
  }, [selectedMonth, selectedStaffId]);

  const fetchPaymentReport = useCallback(async () => {
    let query = supabase
      .from('journal_entries')
      .select(`
        id, entry_date, reference_no, description, transaction_type, paid_by_user_name,
        staff:staff_public(full_name, employee_id),
        lines:journal_lines(id, debit, credit, account:accounts(code, name))
      `)
      .in('transaction_type', ['salary_payout', 'expense_payout', 'advance_paid'])
      .gte('entry_date', format(dateRange.from, 'yyyy-MM-dd'))
      .lte('entry_date', format(dateRange.to, 'yyyy-MM-dd'))
      .order('entry_date', { ascending: false });

    if (selectedStaffId !== 'all') query = query.eq('staff_id', selectedStaffId);
    const { data, error } = await query;
    if (error) throw error;
    setReportData(data || []);
  }, [dateRange, selectedStaffId]);

  const fetchReportData = useCallback(async () => {
    setIsLoading(true);
    try {
      switch (activeReport) {
        case 'summary': await fetchSummaryReport(); break;
        case 'ledger': await fetchLedgerReport(); break;
        case 'salary': await fetchSalaryReport(); break;
        case 'payment': await fetchPaymentReport(); break;
      }
    } catch (error) {
      console.error('Error fetching report:', error);
      toast({ title: 'Error', description: 'Failed to load report data.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [activeReport, fetchSummaryReport, fetchLedgerReport, fetchSalaryReport, fetchPaymentReport]);

  useEffect(() => {
    if (!isOwner && !isCA && !isAccountant && !isAdmin) {
      toast({ title: 'Access Denied', description: 'You do not have permission to view reports.', variant: 'destructive' });
      navigate('/dashboard');
      return;
    }
    fetchStaff();
  }, [isOwner, isCA, isAccountant, isAdmin, navigate, fetchStaff]);

  useEffect(() => {
    setReportData([]);
    if (['summary', 'ledger', 'salary', 'payment'].includes(activeReport)) {
      fetchReportData();
    }
  }, [activeReport, fetchReportData]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });

  const handlePDFExport = async () => {
    const selectedStaffName = staff.find(s => s.id === selectedStaffId)?.full_name || 'All Staff';
    switch (activeReport) {
      case 'summary': await exportSummaryPDF(summaryStats, selectedMonth); break;
      case 'ledger': await exportLedgerPDF(reportData, selectedStaffName, dateRange); break;
      case 'salary': await exportSalaryRegisterPDF(reportData, selectedMonth, canViewSalaries); break;
      case 'payment': await exportPaymentRegisterPDF(reportData, dateRange); break;
    }
    toast({ title: 'PDF Exported', description: 'Report downloaded.' });
  };

  const needsFilters = ['summary', 'ledger', 'salary', 'payment'].includes(activeReport);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Reports" description="Smart reports & AI-powered insights for decision-making">
        {needsFilters && (
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePDFExport} disabled={activeReport === 'summary' ? false : reportData.length === 0}>
              <FileDown className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        )}
      </PageHeader>

      <Tabs value={activeReport} onValueChange={v => setActiveReport(v as ReportType)}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className={cn(
            "inline-flex w-max min-w-full sm:w-full sm:grid gap-1",
            canSeeSalaryReports ? "sm:grid-cols-9" : "sm:grid-cols-8"
          )}>
            <TabsTrigger value="expenses" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <Receipt className="h-4 w-4" /><span className="text-xs sm:text-sm">Expenses</span>
            </TabsTrigger>
            <TabsTrigger value="advances" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <ArrowUpRight className="h-4 w-4" /><span className="text-xs sm:text-sm">Advances</span>
            </TabsTrigger>
            <TabsTrigger value="transactions" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <ListOrdered className="h-4 w-4" /><span className="text-xs sm:text-sm">Transactions</span>
            </TabsTrigger>
            <TabsTrigger value="ai_insights" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <Sparkles className="h-4 w-4" /><span className="text-xs sm:text-sm">AI Insights</span>
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <BarChart3 className="h-4 w-4" /><span className="text-xs sm:text-sm">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="trial_balance" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <Scale className="h-4 w-4" /><span className="text-xs sm:text-sm">Trial Balance</span>
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <FileText className="h-4 w-4" /><span className="text-xs sm:text-sm">Ledger</span>
            </TabsTrigger>
            {canSeeSalaryReports && (
              <TabsTrigger value="salary" className="flex items-center gap-1 px-3 whitespace-nowrap">
                <Wallet className="h-4 w-4" /><span className="text-xs sm:text-sm">Salary</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="payment" className="flex items-center gap-1 px-3 whitespace-nowrap">
              <FileSpreadsheet className="h-4 w-4" /><span className="text-xs sm:text-sm">Payments</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Filters for legacy reports */}
        {needsFilters && (
          <Card className="mt-4">
            <CardContent className="pt-4 px-3 sm:px-6">
              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
                {activeReport !== 'summary' && (
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-xs">Staff</Label>
                    <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                      <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Staff" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Staff</SelectItem>
                        {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(activeReport === 'summary' || activeReport === 'salary') && (
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-xs">Month</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(activeReport === 'ledger' || activeReport === 'payment') && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">From</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm">
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />{format(dateRange.from, 'dd MMM yy')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.from} onSelect={d => d && setDateRange(p => ({ ...p, from: d }))} className="p-3 pointer-events-auto" /></PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">To</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm">
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />{format(dateRange.to, 'dd MMM yy')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.to} onSelect={d => d && setDateRange(p => ({ ...p, to: d }))} className="p-3 pointer-events-auto" /></PopoverContent>
                      </Popover>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== NEW SMART TABS ===== */}
        <TabsContent value="expenses" className="mt-4"><ExpenseExplorer /></TabsContent>
        <TabsContent value="advances" className="mt-4"><AdvanceExplorer /></TabsContent>
        <TabsContent value="transactions" className="mt-4"><TransactionsExplorer /></TabsContent>
        <TabsContent value="ai_insights" className="mt-4"><AIInsights /></TabsContent>

        {/* ===== LEGACY TABS (kept for CA/accounting) ===== */}
        <TabsContent value="summary" className="mt-4">
          <div className={cn("grid gap-3 sm:gap-4 grid-cols-2", canSeeSalaryReports ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
            <Card><CardHeader className="pb-2 p-3 sm:p-6"><CardDescription className="text-xs sm:text-sm">Active Staff</CardDescription><CardTitle className="text-xl sm:text-2xl">{summaryStats.staffCount}</CardTitle></CardHeader></Card>
            {canSeeSalaryReports && (
              <Card><CardHeader className="pb-2 p-3 sm:p-6"><CardDescription className="text-xs sm:text-sm">Monthly Payroll</CardDescription><CardTitle className="text-xl sm:text-2xl"><Amount value={summaryStats.totalPayroll} className="text-foreground" /></CardTitle></CardHeader></Card>
            )}
            <Card><CardHeader className="pb-2 p-3 sm:p-6"><CardDescription className="text-xs sm:text-sm">Advances Outstanding</CardDescription><CardTitle className="text-xl sm:text-2xl"><Amount value={summaryStats.totalAdvances} className="text-warning" /></CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2 p-3 sm:p-6"><CardDescription className="text-xs sm:text-sm">Expenses Reimbursed</CardDescription><CardTitle className="text-xl sm:text-2xl"><Amount value={summaryStats.totalExpenses} className="text-foreground" /></CardTitle></CardHeader></Card>
          </div>
        </TabsContent>

        <TabsContent value="trial_balance" className="mt-4"><TrialBalance /></TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Staff Ledger Report</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Ref No</TableHead><TableHead>Account</TableHead>
                    <TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {reportData.map((line: any) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.journal_entry?.entry_date ? format(new Date(line.journal_entry.entry_date), 'dd MMM yyyy') : '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{line.journal_entry?.reference_no}</TableCell>
                        <TableCell className="text-sm">{line.account?.name || line.account?.code}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{line.journal_entry?.description || line.description}</TableCell>
                        <TableCell className="text-right">{toAmount(line.debit) > 0 && <Amount value={line.debit} />}</TableCell>
                        <TableCell className="text-right">{toAmount(line.credit) > 0 && <Amount value={line.credit} />}</TableCell>
                      </TableRow>
                    ))}
                    {reportData.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No entries found</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canSeeSalaryReports && (
          <TabsContent value="salary" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Salary Register - {selectedMonth ? format(new Date(selectedMonth + '-01'), 'MMMM yyyy') : ''}</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Staff</TableHead><TableHead className="text-right">Base Salary</TableHead>
                      <TableHead className="text-right">Leave Days</TableHead><TableHead className="text-right">Deduction</TableHead>
                      <TableHead className="text-right">Net Salary</TableHead><TableHead className="text-right">Advances Adj.</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {reportData.map(s => (
                        <TableRow key={s.id}>
                          <TableCell>{s.staff?.full_name}</TableCell>
                          <TableCell className="text-right"><Amount value={s.base_salary} /></TableCell>
                          <TableCell className="text-right">{s.leave_days}</TableCell>
                          <TableCell className="text-right"><Amount value={s.leave_deduction} /></TableCell>
                          <TableCell className="text-right"><Amount value={s.net_salary} /></TableCell>
                          <TableCell className="text-right"><Amount value={s.advances_adjusted} /></TableCell>
                          <TableCell className="text-right font-medium"><Amount value={s.balance_payable} /></TableCell>
                        </TableRow>
                      ))}
                      {reportData.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No settlements for this month</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="payment" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Payment Register</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Ref No</TableHead><TableHead>Staff</TableHead>
                    <TableHead>Type</TableHead><TableHead>Paid By</TableHead><TableHead className="text-right">Amount</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {reportData.map((entry: any) => {
                      const amount = (entry.lines || []).reduce((s: number, l: any) => s + toAmount(l.debit), 0) / 2;
                      const typeLabel = entry.transaction_type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>{entry.entry_date ? format(new Date(entry.entry_date), 'dd MMM yyyy') : '-'}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.reference_no}</TableCell>
                          <TableCell>{entry.staff?.full_name || '-'}</TableCell>
                          <TableCell className="capitalize text-sm">{typeLabel}</TableCell>
                          <TableCell className="text-sm">{entry.paid_by_user_name || '-'}</TableCell>
                          <TableCell className="text-right"><Amount value={amount} /></TableCell>
                        </TableRow>
                      );
                    })}
                    {reportData.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No payments found</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
