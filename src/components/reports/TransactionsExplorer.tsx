import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toAmount } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { CalendarIcon, Eye, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface DateRange { from: Date; to: Date; }
type DatePreset = 'last7' | 'last30' | 'thisMonth' | 'last3Months' | 'custom';
type TxnType = 'all' | 'advance' | 'expense' | 'settlement' | 'payment';

const TXN_TYPE_LABELS: Record<string, string> = {
  advance: 'Advance',
  expense: 'Expense',
  settlement: 'Settlement',
  payment: 'Payment',
  journal: 'Journal',
  deduction: 'Deduction',
};

export function TransactionsExplorer() {
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [selectedType, setSelectedType] = useState<TxnType>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('last30');
  const [dateRange, setDateRange] = useState<DateRange>({ from: subDays(new Date(), 30), to: new Date() });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<any>(null);

  useEffect(() => { fetchStaff(); }, []);

  useEffect(() => {
    const now = new Date();
    switch (datePreset) {
      case 'last7': setDateRange({ from: subDays(now, 7), to: now }); break;
      case 'last30': setDateRange({ from: subDays(now, 30), to: now }); break;
      case 'thisMonth': setDateRange({ from: startOfMonth(now), to: endOfMonth(now) }); break;
      case 'last3Months': setDateRange({ from: subMonths(now, 3), to: now }); break;
    }
  }, [datePreset]);

  const fetchStaff = async () => {
    const { data } = await supabase.from('staff_public').select('id, full_name, employee_id').order('full_name');
    setStaff(data || []);
  };

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select(`
          id, entry_date, reference_no, description, transaction_type, 
          paid_by_user_name, staff_id, is_immutable, created_at,
          staff:staff_public(full_name, employee_id),
          lines:journal_lines(id, debit, credit, account:accounts(code, name))
        `)
        .gte('entry_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('entry_date', format(dateRange.to, 'yyyy-MM-dd'))
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (selectedStaffId !== 'all') query = query.eq('staff_id', selectedStaffId);
      if (selectedType !== 'all') {
        const typeMap: Record<string, string[]> = {
          advance: ['advance_paid', 'advance_adjustment'],
          expense: ['expense_approval', 'expense_payout'],
          settlement: ['salary_settlement', 'salary_payout'],
          payment: ['salary_payout', 'expense_payout', 'advance_paid'],
        };
        query = query.in('transaction_type', typeMap[selectedType] || [selectedType]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStaffId, selectedType, dateRange]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const totals = useMemo(() => {
    let totalDebit = 0, totalCredit = 0;
    transactions.forEach(t => {
      (t.lines || []).forEach((l: any) => {
        totalDebit += toAmount(l.debit) || 0;
        totalCredit += toAmount(l.credit) || 0;
      });
    });
    return { totalDebit: totalDebit / 2, totalCredit: totalCredit / 2, count: transactions.length };
  }, [transactions]);

  const getTxnAmount = (txn: any) => {
    const lines = txn.lines || [];
    return lines.reduce((s: number, l: any) => s + (toAmount(l.debit) || 0), 0);
  };

  const getTxnTypeBadge = (type: string) => {
    const colorMap: Record<string, string> = {
      salary_settlement: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
      salary_payout: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
      expense_approval: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
      expense_payout: 'bg-teal-100 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400',
      advance_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
      advance_adjustment: 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
    };
    const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return <Badge variant="outline" className={`text-xs ${colorMap[type] || ''}`}>{label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Staff</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger><SelectValue placeholder="All Staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={selectedType} onValueChange={v => setSelectedType(v as TxnType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="advance">Advances</SelectItem>
                  <SelectItem value="expense">Expenses</SelectItem>
                  <SelectItem value="settlement">Salary Settlements</SelectItem>
                  <SelectItem value="payment">Cash Payments</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={datePreset} onValueChange={v => setDatePreset(v as DatePreset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last7">Last 7 days</SelectItem>
                  <SelectItem value="last30">Last 30 days</SelectItem>
                  <SelectItem value="thisMonth">This month</SelectItem>
                  <SelectItem value="last3Months">Last 3 months</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {datePreset === 'custom' && (
              <div className="space-y-1 flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 text-xs"><CalendarIcon className="mr-1 h-3.5 w-3.5" />{format(dateRange.from, 'dd MMM')}</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.from} onSelect={d => d && setDateRange(p => ({ ...p, from: d }))} className="p-3 pointer-events-auto" /></PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 text-xs"><CalendarIcon className="mr-1 h-3.5 w-3.5" />{format(dateRange.to, 'dd MMM')}</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.to} onSelect={d => d && setDateRange(p => ({ ...p, to: d }))} className="p-3 pointer-events-auto" /></PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Total Debits</p><p className="text-lg font-bold"><Amount value={totals.totalDebit} className="text-foreground" /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Total Credits</p><p className="text-lg font-bold"><Amount value={totals.totalCredit} className="text-foreground" /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Entries</p><p className="text-lg font-bold">{totals.count}</p></CardHeader></Card>
      </div>

      {/* Transactions List */}
      <Card>
        <CardHeader><CardTitle className="text-base">All Transactions</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ref No</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map(txn => (
                  <TableRow key={txn.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTxn(txn)}>
                    <TableCell className="text-xs">{format(new Date(txn.entry_date), 'dd MMM yy')}</TableCell>
                    <TableCell className="font-mono text-xs">{txn.reference_no}</TableCell>
                    <TableCell className="text-sm">{txn.staff?.full_name || '-'}</TableCell>
                    <TableCell>{getTxnTypeBadge(txn.transaction_type)}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{txn.description}</TableCell>
                    <TableCell className="text-right font-medium"><Amount value={getTxnAmount(txn)} /></TableCell>
                    <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTxn} onOpenChange={() => setSelectedTxn(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Transaction Details</DialogTitle></DialogHeader>
          {selectedTxn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Reference</p><p className="text-sm font-mono">{selectedTxn.reference_no}</p></div>
                <div><p className="text-xs text-muted-foreground">Date</p><p className="text-sm">{format(new Date(selectedTxn.entry_date), 'dd MMM yyyy')}</p></div>
                <div><p className="text-xs text-muted-foreground">Type</p>{getTxnTypeBadge(selectedTxn.transaction_type)}</div>
                <div><p className="text-xs text-muted-foreground">Staff</p><p className="text-sm">{selectedTxn.staff?.full_name || '-'}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="text-sm">{selectedTxn.description}</p></div>
                {selectedTxn.paid_by_user_name && (
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Paid By</p><p className="text-sm">{selectedTxn.paid_by_user_name}</p></div>
                )}
              </div>

              {/* Journal Lines */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Journal Lines</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Account</TableHead>
                      <TableHead className="text-right text-xs">Debit</TableHead>
                      <TableHead className="text-right text-xs">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedTxn.lines || []).map((line: any) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-sm">{line.account?.name || line.account?.code}</TableCell>
                        <TableCell className="text-right">{toAmount(line.debit) > 0 ? <Amount value={line.debit} /> : '-'}</TableCell>
                        <TableCell className="text-right">{toAmount(line.credit) > 0 ? <Amount value={line.credit} /> : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
