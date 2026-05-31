import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toAmount } from '@/lib/utils';
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
  ClipboardList, 
  ChevronRight, 
  Receipt, 
  Banknote,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/database';

interface PendingApproval {
  id: string;
  type: 'expense' | 'request';
  staffName: string;
  staffId: string;
  amount: number;
  description: string;
  category?: string;
  date: string;
}

interface ApprovalsWidgetProps {
  variant?: 'compact' | 'full';
}

export function ApprovalsWidget({ variant = 'compact' }: ApprovalsWidgetProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingApproval[]>([]);
  const [counts, setCounts] = useState({
    expenses: 0,
    requests: 0,
  });
  const [totals, setTotals] = useState({
    expenses: 0,
    requests: 0,
  });

  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const fetchPendingApprovals = async () => {
    try {
      setIsLoading(true);
      const items: PendingApproval[] = [];

      // Fetch pending expenses
      const { data: expenses, error: expError } = await supabase
        .from('expenses')
        .select('id, amount, description, category, created_at, staff:staff_id(full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

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
          date: exp.created_at,
        });
      });

      // Fetch pending requests
      const { data: requests, error: reqError } = await supabase
        .from('payment_requests')
        .select('id, amount, reason, created_at, staff:staff_id(full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (reqError) throw reqError;

      requests?.forEach((req: any) => {
        items.push({
          id: req.id,
          type: 'request',
          staffName: req.staff?.full_name || 'Unknown',
          staffId: req.staff_id,
          amount: req.amount,
          description: req.reason,
          date: req.created_at,
        });
      });

      setPendingItems(items);
      setCounts({
        expenses: expenses?.length || 0,
        requests: requests?.length || 0,
      });
      setTotals({
        expenses: expenses?.reduce((sum, e) => sum + toAmount(e.amount), 0) || 0,
        requests: requests?.reduce((sum, r) => sum + toAmount(r.amount), 0) || 0,
      });
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalCount = counts.expenses + counts.requests;
  const totalAmount = totals.expenses + totals.requests;

  const handleWidgetClick = () => {
    if (totalCount === 0) {
      navigate('/requests');
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
                <div className={`p-3 rounded-xl ${totalCount > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                  <ClipboardList className={`h-6 w-6 ${totalCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending Approvals</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{totalCount}</p>
                    {totalCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        Action needed
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
                <ClipboardList className="h-5 w-5" />
                Pending Approvals
                <Badge variant="destructive">{totalCount} items</Badge>
              </DialogTitle>
              <DialogDescription>
                Items awaiting your approval. Total value: <Amount value={totalAmount} className="inline font-semibold" />
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="all" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
                <TabsTrigger value="expenses">Expenses ({counts.expenses})</TabsTrigger>
                <TabsTrigger value="requests">Requests ({counts.requests})</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[400px] mt-4">
                <TabsContent value="all" className="mt-0">
                  <ApprovalItemsList items={pendingItems} />
                </TabsContent>
                <TabsContent value="expenses" className="mt-0">
                  <ApprovalItemsList items={pendingItems.filter(i => i.type === 'expense')} />
                </TabsContent>
                <TabsContent value="requests" className="mt-0">
                  <ApprovalItemsList items={pendingItems.filter(i => i.type === 'request')} />
                </TabsContent>
              </ScrollArea>
            </Tabs>

            <div className="flex justify-between mt-4">
              <Link to="/expenses">
                <Button variant="outline" className="gap-2">
                  <Receipt className="h-4 w-4" />
                  Review Expenses
                </Button>
              </Link>
              <Link to="/requests">
                <Button className="gap-2">
                  <Banknote className="h-4 w-4" />
                  Review Requests
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full variant
  return (
    <Card className="rounded-2xl shadow-card border-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Pending Approvals
            {totalCount > 0 && (
              <Badge variant="destructive" className="text-xs">{totalCount}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {totalCount > 0 ? (
              <span className="flex items-center gap-2">
                <AlertCircle className="h-3 w-3 text-destructive" />
                {totalCount} items need your approval
              </span>
            ) : (
              'All items reviewed'
            )}
          </CardDescription>
        </div>
        <Link to="/requests">
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
            <p className="text-muted-foreground">No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingItems.slice(0, 4).map((item) => {
              const TypeIcon = item.type === 'expense' ? Receipt : Banknote;
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                      <TypeIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.staffName}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Amount value={item.amount} size="sm" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(item.date), 'dd MMM')}
                    </p>
                  </div>
                </div>
              );
            })}

            {pendingItems.length > 4 && (
              <p className="text-center text-sm text-muted-foreground">
                +{pendingItems.length - 4} more items
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalItemsList({ items }: { items: PendingApproval[] }) {
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
        const TypeIcon = item.type === 'expense' ? Receipt : Banknote;
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
