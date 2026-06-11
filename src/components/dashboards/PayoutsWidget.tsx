import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toAmount } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CreditCard, 
  ChevronRight, 
  Receipt, 
  Banknote, 
  Wallet,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/database';

interface PendingItem {
  id: string;
  type: 'expense' | 'request' | 'salary';
  staffName: string;
  staffId: string;
  amount: number;
  description: string;
  category?: string;
  date: string;
}

interface PayoutsWidgetProps {
  variant?: 'compact' | 'full';
  showSalary?: boolean;
}

export function PayoutsWidget({ variant = 'compact', showSalary = false }: PayoutsWidgetProps) {
  const { canRecordSalaryPayments } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [counts, setCounts] = useState({
    expenses: 0,
    requests: 0,
    salary: 0,
  });
  const [totals, setTotals] = useState({
    expenses: 0,
    requests: 0,
    salary: 0,
  });

  const fetchPendingPayouts = useCallback(async () => {
    try {
      setIsLoading(true);
      const items: PendingItem[] = [];

      // Fetch approved expenses (not reimbursed)
      const { data: expenses, error: expError } = await supabase
        .from('expenses')
        .select('id, amount, description, category, approved_at, staff:staff_id(full_name)')
        .eq('status', 'approved')
        .order('approved_at', { ascending: true });

      if (expError) throw expError;

      expenses?.forEach((exp: any) => {
        items.push({
          id: exp.id,
          type: 'expense',
          staffName: exp.staff?.full_name || 'Unknown',
          staffId: exp.staff_id,
          amount: exp.amount,
          description: exp.description,
          category: EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory],
          date: exp.approved_at,
        });
      });

      // Fetch approved but unpaid requests
      const { data: requests, error: reqError } = await supabase
        .from('payment_requests')
        .select('id, amount, reason, approved_at, staff:staff_id(full_name)')
        .eq('status', 'approved')
        .is('paid_at', null)
        .order('approved_at', { ascending: true });

      if (reqError) throw reqError;

      requests?.forEach((req: any) => {
        items.push({
          id: req.id,
          type: 'request',
          staffName: req.staff?.full_name || 'Unknown',
          staffId: req.staff_id,
          amount: req.amount,
          description: req.reason,
          date: req.approved_at,
        });
      });

      // Fetch pending salary settlements (Owner only)
      let salaryData: any[] = [];
      if (canRecordSalaryPayments && showSalary) {
        const { data: salaries, error: salError } = await supabase
          .from('salary_settlements')
          .select('id, balance_payable, settlement_month, created_at, staff:staff_id(full_name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (!salError && salaries) {
          salaryData = salaries;
          salaries.forEach((sal: any) => {
            items.push({
              id: sal.id,
              type: 'salary',
              staffName: sal.staff?.full_name || 'Unknown',
              staffId: sal.staff_id,
              amount: sal.balance_payable,
              description: `Salary for ${format(new Date(sal.settlement_month + '-01'), 'MMMM yyyy')}`,
              date: sal.created_at,
            });
          });
        }
      }

      setPendingItems(items);
      setCounts({
        expenses: expenses?.length || 0,
        requests: requests?.length || 0,
        salary: salaryData.length,
      });
      setTotals({
        expenses: expenses?.reduce((sum, e) => sum + toAmount(e.amount), 0) || 0,
        requests: requests?.reduce((sum, r) => sum + toAmount(r.amount), 0) || 0,
        salary: salaryData.reduce((sum, s) => sum + toAmount(s.balance_payable), 0),
      });
    } catch (error) {
      console.error('Error fetching pending payouts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [canRecordSalaryPayments, showSalary]);

  useEffect(() => {
    fetchPendingPayouts();
  }, [fetchPendingPayouts]);

  const totalCount = counts.expenses + counts.requests + (showSalary ? counts.salary : 0);
  const totalAmount = totals.expenses + totals.requests + (showSalary ? totals.salary : 0);

  const getTypeIcon = (type: PendingItem['type']) => {
    switch (type) {
      case 'expense': return Receipt;
      case 'request': return Banknote;
      case 'salary': return Wallet;
    }
  };

  const handleWidgetClick = () => {
    if (totalCount === 0) {
      navigate('/payouts');
    } else {
      setShowDetailsDialog(true);
    }
  };

  if (variant === 'compact') {
    return (
      <>
        <Card 
          className="rounded-2xl shadow-card border-0 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={handleWidgetClick}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${totalCount > 0 ? 'bg-primary/10' : 'bg-muted'}`}>
                  <CreditCard className={`h-6 w-6 ${totalCount > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending Payouts</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{totalCount}</p>
                    {totalCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <Amount value={totalAmount} size="sm" />
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {totalCount > 0 ? (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex gap-1">
                    {counts.expenses > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Receipt className="h-3 w-3" />
                        {counts.expenses}
                      </Badge>
                    )}
                    {counts.requests > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Banknote className="h-3 w-3" />
                        {counts.requests}
                      </Badge>
                    )}
                    {showSalary && counts.salary > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Wallet className="h-3 w-3" />
                        {counts.salary}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    Click for details <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              ) : (
                <CheckCircle className="h-6 w-6 text-muted-foreground/30" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Pending Payouts
                <Badge variant="secondary">{totalCount} items</Badge>
              </DialogTitle>
              <DialogDescription>
                Approved items awaiting payout. Total: <Amount value={totalAmount} className="inline font-semibold" />
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="all" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
                <TabsTrigger value="expenses">Expenses ({counts.expenses})</TabsTrigger>
                <TabsTrigger value="requests">Advances ({counts.requests})</TabsTrigger>
                {showSalary && <TabsTrigger value="salary">Salary ({counts.salary})</TabsTrigger>}
              </TabsList>

              <ScrollArea className="h-[400px] mt-4">
                <TabsContent value="all" className="mt-0">
                  <PayoutItemsList items={pendingItems} />
                </TabsContent>
                <TabsContent value="expenses" className="mt-0">
                  <PayoutItemsList items={pendingItems.filter(i => i.type === 'expense')} />
                </TabsContent>
                <TabsContent value="requests" className="mt-0">
                  <PayoutItemsList items={pendingItems.filter(i => i.type === 'request')} />
                </TabsContent>
                {showSalary && (
                  <TabsContent value="salary" className="mt-0">
                    <PayoutItemsList items={pendingItems.filter(i => i.type === 'salary')} />
                  </TabsContent>
                )}
              </ScrollArea>
            </Tabs>

            <div className="flex justify-end mt-4">
              <Link to="/payouts">
                <Button className="gap-2">
                  Go to Payouts
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full variant for dashboard cards
  return (
    <Card className="rounded-2xl shadow-card border-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pending Payouts
          </CardTitle>
          <CardDescription>
            {totalCount > 0 ? (
              <span className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {totalCount} items totaling <Amount value={totalAmount} size="sm" className="font-medium" />
              </span>
            ) : (
              'All payouts complete'
            )}
          </CardDescription>
        </div>
        <Link to="/payouts">
          <Button variant="ghost" size="sm" className="rounded-lg text-primary hover:text-primary">
            View all
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground">No pending payouts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary badges */}
            <div className="flex gap-2 flex-wrap">
              {counts.expenses > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                  <Receipt className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{counts.expenses} Expenses</span>
                  <Amount value={totals.expenses} size="sm" className="text-muted-foreground" />
                </div>
              )}
              {counts.requests > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/50 border">
                  <Banknote className="h-4 w-4 text-accent-foreground" />
                  <span className="text-sm font-medium">{counts.requests} Advances</span>
                  <Amount value={totals.requests} size="sm" className="text-muted-foreground" />
                </div>
              )}
              {showSalary && counts.salary > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary border">
                  <Wallet className="h-4 w-4 text-secondary-foreground" />
                  <span className="text-sm font-medium">{counts.salary} Salaries</span>
                  <Amount value={totals.salary} size="sm" className="text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Recent items */}
            {pendingItems.slice(0, 3).map((item) => {
              const TypeIcon = getTypeIcon(item.type);
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0">
                      <TypeIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.staffName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <Amount value={item.amount} size="sm" />
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {item.type}
                    </Badge>
                  </div>
                </div>
              );
            })}

            {pendingItems.length > 3 && (
              <p className="text-center text-sm text-muted-foreground">
                +{pendingItems.length - 3} more items
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PayoutItemsList({ items }: { items: PendingItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>No items in this category</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const TypeIcon = item.type === 'expense' ? Receipt : item.type === 'request' ? Banknote : Wallet;
        return (
          <div
            key={`${item.type}-${item.id}`}
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <TypeIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">{item.staffName}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {item.description}
                </p>
                {item.category && (
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {item.category}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <Amount value={item.amount} />
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(item.date), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
