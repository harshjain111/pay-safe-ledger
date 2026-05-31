import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { Amount } from '@/components/ui/amount';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Receipt, 
  Search, 
  Check, 
  X, 
  Eye,
  ArrowRight,
  Calendar,
  Ban
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { Expense, ExpenseStatus } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS } from '@/types/database';
import { ExpenseDetailsDialog } from '@/components/expenses/ExpenseDetailsDialog';
import { ApproveExpenseDialog } from '@/components/expenses/ApproveExpenseDialog';
import { RejectExpenseDialog } from '@/components/expenses/RejectExpenseDialog';
import { CancelApprovalDialog } from '@/components/expenses/CancelApprovalDialog';
import { CreateEventDialog } from '@/components/events/CreateEventDialog';

export default function Expenses() {
  const { 
    user, 
    isOwner, 
    isAdmin, 
    isAccountant, 
    isStaff,
    staffData,
    accountingMode,
    canApproveExpenses 
  } = useAuth();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showCreateEventDialog, setShowCreateEventDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, [activeTab, staffData?.id, accountingMode]);

  const fetchExpenses = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from('expenses')
        .select(`
          *,
          staff:staff_public(*)
        `)
        .order('created_at', { ascending: false });

      // CRITICAL: Personal context filtering
      // Staff always sees only their own expenses
      // Accountant in personal mode (My Account) sees only their own expenses
      // This ensures complete isolation between personal and role contexts
      if (isStaff || (isAccountant && !accountingMode)) {
        if (staffData?.id) {
          query = query.eq('staff_id', staffData.id);
        } else {
          // No staff record - return empty
          setExpenses([]);
          setIsLoading(false);
          return;
        }
      }

      // Filter by status
      if (activeTab !== 'all') {
        query = query.eq('status', activeTab as ExpenseStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setExpenses((data || []) as unknown as Expense[]);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast({
        title: 'Error',
        description: 'Failed to load expenses',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredExpenses = expenses.filter((expense) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      expense.description.toLowerCase().includes(searchLower) ||
      expense.staff?.full_name?.toLowerCase().includes(searchLower) ||
      EXPENSE_CATEGORY_LABELS[expense.category].toLowerCase().includes(searchLower)
    );
  });

  const handleViewDetails = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowDetailsDialog(true);
  };

  const handleApprove = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowApproveDialog(true);
  };

  const handleReject = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowRejectDialog(true);
  };

  const handleCancelApproval = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowCancelDialog(true);
  };

  const getStatusVariant = (status: ExpenseStatus) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'pending': return 'warning';
      case 'approved': return 'info';
      case 'rejected': return 'destructive';
      case 'reimbursed': return 'success';
      default: return 'secondary';
    }
  };

  // Permission checks:
  // Staff can create expenses for themselves
  // Owner, Admin can create expenses for any staff
  // Accountant can create expenses - in personal mode (My Account) for themselves, in Accounting mode for any staff
  const canCreateExpense = isStaff || isOwner || isAdmin || isAccountant;
  
  // Only Owner and Admin can approve/reject (NOT Accountant)
  const canApprove = canApproveExpenses;

  // Only Owner, Admin, Accountant can create events (NOT Staff)
  const canCreateEvent = isOwner || isAdmin || isAccountant;

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Expenses"
        description="Submit and review expense claims"
      >
        <div className="flex items-center gap-2">
          {canCreateEvent && (
            <Button 
              variant="outline" 
              className="text-sm sm:text-base px-3 sm:px-4"
              onClick={() => setShowCreateEventDialog(true)}
            >
              <Calendar className="mr-1.5 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Create Event</span>
              <span className="sm:hidden">Event</span>
            </Button>
          )}
          {canCreateExpense && (
            <Link to="/expenses/new">
              <Button className="text-sm sm:text-base px-3 sm:px-4">
                <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New Expense</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          )}
        </div>
      </PageHeader>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
          <TabsTrigger value="all" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">All</TabsTrigger>
          {isStaff && <TabsTrigger value="draft" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Drafts</TabsTrigger>}
          <TabsTrigger value="pending" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Pending</TabsTrigger>
          <TabsTrigger value="approved" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Approved</TabsTrigger>
          <TabsTrigger value="reimbursed" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Paid</TabsTrigger>
          <TabsTrigger value="rejected" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 sm:mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses found"
              description={activeTab === 'all' 
                ? "No expenses have been recorded yet." 
                : `No ${EXPENSE_STATUS_LABELS[activeTab as ExpenseStatus] || activeTab} expenses.`}
              action={
                canCreateExpense ? (
                  <Link to="/expenses/new">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Expense
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3 sm:gap-4">
              {filteredExpenses.map((expense) => (
                <Card key={expense.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3">
                      {/* Top row: Status + Category */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge 
                            status={expense.status} 
                            variant={getStatusVariant(expense.status)}
                          >
                            {EXPENSE_STATUS_LABELS[expense.status]}
                          </StatusBadge>
                          <span className="text-[10px] sm:text-xs text-muted-foreground">
                            {EXPENSE_CATEGORY_LABELS[expense.category]}
                          </span>
                        </div>
                        <Amount value={expense.amount} size="lg" className="text-foreground shrink-0" />
                      </div>
                      
                      {/* Description */}
                      <p className="font-medium text-sm sm:text-base line-clamp-2">{expense.description}</p>
                      
                      {/* Bottom row: Staff + Date + Actions */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                          <span className="truncate max-w-[120px] sm:max-w-none">{expense.staff?.full_name}</span>
                          <span>{format(new Date(expense.expense_date), 'dd MMM')}</span>
                          {expense.approved_by_user_name && (
                            <span className="text-[10px] sm:text-xs italic">
                              {expense.status === 'rejected' ? 'Rejected' : 'Approved'} by: {expense.approved_by_user_name}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 sm:gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:h-9 sm:w-9"
                            onClick={() => handleViewDetails(expense)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {/* Owner/Admin can approve/reject pending expenses */}
                          {canApprove && expense.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-success hover:text-success h-8 w-8 sm:h-9 sm:w-9"
                                onClick={() => handleApprove(expense)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive h-8 w-8 sm:h-9 sm:w-9"
                                onClick={() => handleReject(expense)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}

                          {/* Show "Go to Payouts" indicator for approved expenses */}
                          {expense.status === 'approved' && (isOwner || isAdmin || isAccountant) && (
                            <Link to="/payouts">
                              <Button variant="outline" size="sm" className="gap-1 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                                <span className="hidden sm:inline">Pay via </span>Payouts
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}

                          {/* Cancel approval button for Owner/Admin on approved expenses */}
                          {expense.status === 'approved' && (isOwner || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive h-8 w-8 sm:h-9 sm:w-9"
                              onClick={() => handleCancelApproval(expense)}
                              title="Cancel Approval"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs - No reimbursement dialog anymore */}
      {selectedExpense && (
        <>
          <ExpenseDetailsDialog
            expense={selectedExpense}
            open={showDetailsDialog}
            onOpenChange={setShowDetailsDialog}
          />
          <ApproveExpenseDialog
            expense={selectedExpense}
            open={showApproveDialog}
            onOpenChange={setShowApproveDialog}
            onSuccess={fetchExpenses}
          />
          <RejectExpenseDialog
            expense={selectedExpense}
            open={showRejectDialog}
            onOpenChange={setShowRejectDialog}
            onSuccess={fetchExpenses}
          />
          <CancelApprovalDialog
            open={showCancelDialog}
            onOpenChange={setShowCancelDialog}
            onSuccess={fetchExpenses}
            item={{
              id: selectedExpense.id,
              type: 'expense',
              staffName: selectedExpense.staff?.full_name || 'Staff',
              staffId: selectedExpense.staff_id,
              staffUserId: selectedExpense.staff?.user_id,
              amount: selectedExpense.amount,
              description: selectedExpense.description,
            }}
          />
        </>
      )}

      {/* Create Event Dialog */}
      <CreateEventDialog
        open={showCreateEventDialog}
        onOpenChange={setShowCreateEventDialog}
      />
    </div>
  );
}
