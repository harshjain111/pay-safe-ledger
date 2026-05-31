import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatCard } from '@/components/ui/stat-card';
import { Amount } from '@/components/ui/amount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Coins,
  Plus,
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Loader2,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';

type PettyCashTransactionType = 'opening_balance' | 'top_up' | 'expense_payment' | 'advance_payment';

interface PettyCashTransaction {
  id: string;
  transaction_date: string;
  transaction_type: PettyCashTransactionType;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  source: string | null;
  created_by: string;
  created_at: string;
}

const TRANSACTION_TYPE_LABELS: Record<PettyCashTransactionType, string> = {
  opening_balance: 'Opening Balance',
  top_up: 'Top-Up',
  expense_payment: 'Expense Payment',
  advance_payment: 'Advance Payment',
};

const TRANSACTION_TYPE_COLORS: Record<PettyCashTransactionType, string> = {
  opening_balance: 'default',
  top_up: 'secondary',
  expense_payment: 'destructive',
  advance_payment: 'outline',
};

const SOURCE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'cash_collection', label: 'Cash Collection' },
  { value: 'other', label: 'Other' },
];

function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export default function PettyCash() {
  const { user, isOwner, isAdmin } = useAuth();
  const canAccess = isOwner || isAdmin;

  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTopUpDialog, setShowTopUpDialog] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpNotes, setTopUpNotes] = useState('');
  const [topUpSource, setTopUpSource] = useState('owner');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [filterType, setFilterType] = useState<string>('all');

  // Summary stats
  const [currentBalance, setCurrentBalance] = useState(0);
  const [totalTopUps, setTotalTopUps] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [lastTopUpDate, setLastTopUpDate] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      // Build filtered query
      let query = (supabase.from as any)('petty_cash_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (dateRange?.from) {
        query = query.gte('transaction_date', format(dateRange.from, 'yyyy-MM-dd'));
      }
      if (dateRange?.to) {
        query = query.lte('transaction_date', format(dateRange.to, 'yyyy-MM-dd'));
      }
      if (filterType !== 'all') {
        query = query.eq('transaction_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;

      setTransactions((data || []) as PettyCashTransaction[]);

      // Compute summary from ALL transactions (unfiltered)
      const { data: allData, error: allError } = await (supabase.from as any)('petty_cash_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (allError) throw allError;
      const all = (allData || []) as PettyCashTransaction[];

      setCurrentBalance(all.length > 0 ? all[0].balance_after : 0);

      const topUps = all.filter(t => t.transaction_type === 'top_up' || t.transaction_type === 'opening_balance');
      setTotalTopUps(topUps.reduce((sum, t) => sum + t.amount, 0));

      const spent = all.filter(t => t.transaction_type === 'expense_payment' || t.transaction_type === 'advance_payment');
      setTotalSpent(spent.reduce((sum, t) => sum + t.amount, 0));

      const lastTopUp = all.find(t => t.transaction_type === 'top_up' || t.transaction_type === 'opening_balance');
      setLastTopUpDate(lastTopUp ? lastTopUp.transaction_date : null);
    } catch (error: any) {
      console.error('Error fetching petty cash:', error);
      toast({ title: 'Error', description: 'Failed to load petty cash data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, filterType]);

  useEffect(() => {
    if (canAccess) fetchTransactions();
    else setIsLoading(false);
  }, [canAccess, fetchTransactions]);

  const handleAddTopUp = async () => {
    if (!user || !topUpAmount || Number(topUpAmount) <= 0) return;

    setIsSubmitting(true);
    try {
      const amount = Number(topUpAmount);
      const newBalance = currentBalance + amount;

      const { error } = await (supabase.from as any)('petty_cash_transactions').insert({
        transaction_type: transactions.length === 0 && currentBalance === 0 ? 'opening_balance' : 'top_up',
        amount,
        balance_after: newBalance,
        notes: topUpNotes || null,
        source: topUpSource,
        created_by: user.id,
      });

      if (error) throw error;

      toast({ title: 'Top-Up Added', description: `₹${amount.toLocaleString('en-IN')} added to petty cash` });
      setShowTopUpDialog(false);
      setTopUpAmount('');
      setTopUpNotes('');
      setTopUpSource('owner');
      fetchTransactions();
    } catch (error: any) {
      console.error('Error adding top-up:', error);
      toast({ title: 'Error', description: error.message || 'Failed to add top-up', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Coins className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">Only Owner and Admin can access Petty Cash.</p>
      </div>
    );
  }

  const isInflow = (type: PettyCashTransactionType) => type === 'opening_balance' || type === 'top_up';

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Petty Cash"
        description="Track and manage petty cash float"
      >
        <Button onClick={() => setShowTopUpDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Top-Up
        </Button>
      </PageHeader>

      {/* Summary Tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard
          title="Current Balance"
          value={formatCurrency(currentBalance)}
          icon={Wallet}
          color="green"
        />
        <StatCard
          title="Total Top-Ups"
          value={formatCurrency(totalTopUps)}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Total Spent"
          value={formatCurrency(totalSpent)}
          icon={TrendingDown}
          color="orange"
        />
        <StatCard
          title="Last Top-Up"
          value={lastTopUpDate ? format(new Date(lastTopUpDate), 'dd MMM yyyy') : 'N/A'}
          icon={CalendarDays}
          color="purple"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px] text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="opening_balance">Opening Balance</SelectItem>
                <SelectItem value="top_up">Top-Up</SelectItem>
                <SelectItem value="expense_payment">Expense Payment</SelectItem>
                <SelectItem value="advance_payment">Advance Payment</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                  <CalendarDays className="mr-2 h-3.5 w-3.5" />
                  {dateRange?.from
                    ? `${format(dateRange.from, 'dd MMM')}${dateRange.to ? ` - ${format(dateRange.to, 'dd MMM')}` : ''}`
                    : 'Date Range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
            {(filterType !== 'all' || dateRange) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterType('all'); setDateRange(undefined); }}
                className="text-xs"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction Ledger */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No petty cash transactions"
          description="Add a top-up to start tracking petty cash."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="hidden sm:table-cell">Notes</TableHead>
                  <TableHead className="hidden md:table-cell">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                      {format(new Date(txn.transaction_date), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TRANSACTION_TYPE_COLORS[txn.transaction_type] as any} className="text-[10px] sm:text-xs whitespace-nowrap">
                        {TRANSACTION_TYPE_LABELS[txn.transaction_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={isInflow(txn.transaction_type) ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                        {isInflow(txn.transaction_type) ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ₹{txn.balance_after.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                      {txn.notes || '-'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground capitalize">
                      {txn.source?.replace('_', ' ') || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Top-Up Dialog */}
      <Dialog open={showTopUpDialog} onOpenChange={setShowTopUpDialog}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Petty Cash Top-Up</DialogTitle>
            <DialogDescription>Add funds to the petty cash float</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="1"
                placeholder="Enter amount"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={topUpSource} onValueChange={setTopUpSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="e.g. Weekly cash refill"
                value={topUpNotes}
                onChange={(e) => setTopUpNotes(e.target.value)}
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Balance:</span>
                <span className="font-medium">₹{currentBalance.toLocaleString('en-IN')}</span>
              </div>
              {topUpAmount && Number(topUpAmount) > 0 && (
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">New Balance:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{(currentBalance + Number(topUpAmount)).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopUpDialog(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleAddTopUp}
              disabled={isSubmitting || !topUpAmount || Number(topUpAmount) <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Top-Up
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
