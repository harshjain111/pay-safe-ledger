import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { ListSkeleton } from '@/components/layout/ListSkeleton';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterBar } from '@/components/layout/filter-bar';
import { StatusTabs } from '@/components/ui/status-tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { Amount } from '@/components/ui/amount';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Receipt,
  Search,
  Eye,
  ArrowRight,
  Ban
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { Expense, ExpenseStatus } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS } from '@/types/database';
import { ExpenseDetailsDialog } from '@/components/expenses/ExpenseDetailsDialog';
import { CancelApprovalDialog } from '@/components/expenses/CancelApprovalDialog';

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
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const fetchExpenses = useCallback(async () => {
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
  }, [activeTab, staffData?.id, accountingMode, isStaff, isAccountant]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

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

  const expenseColumns: DataTableColumn<Expense>[] = [
    {
      id: 'date',
      header: 'Date',
      sortable: true,
      sortAccessor: (e) => new Date(e.expense_date),
      cellClassName: 'whitespace-nowrap text-sm text-muted-foreground',
      cell: (e) => format(new Date(e.expense_date), 'dd MMM yyyy'),
    },
    {
      id: 'category',
      header: 'Category',
      sortable: true,
      sortAccessor: (e) => e.category,
      cell: (e) => <span className="text-sm">{EXPENSE_CATEGORY_LABELS[e.category]}</span>,
    },
    {
      id: 'description',
      header: 'Description',
      cellClassName: 'max-w-[260px]',
      cell: (e) => (
        <div className="min-w-0">
          <span className="block truncate font-medium" title={e.description}>{e.description}</span>
          {e.approved_by_user_name && (
            <span className="text-[11px] italic text-muted-foreground">
              {e.status === 'rejected' ? 'Rejected' : 'Approved'} by {e.approved_by_user_name}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'staff',
      header: 'Staff',
      sortable: true,
      sortAccessor: (e) => e.staff?.full_name ?? '',
      cell: (e) => <span className="text-sm">{e.staff?.full_name || '—'}</span>,
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortAccessor: (e) => e.amount,
      cell: (e) => <Amount value={e.amount} size="sm" />,
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: (e) => e.status,
      cell: (e) => (
        <StatusBadge status={e.status} variant={getStatusVariant(e.status)}>
          {EXPENSE_STATUS_LABELS[e.status]}
        </StatusBadge>
      ),
    },
  ];

  const renderExpenseActions = (expense: Expense) => (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View expense details" onClick={() => handleViewDetails(expense)}>
        <Eye className="h-4 w-4" />
      </Button>
      {expense.status === 'approved' && (isOwner || isAdmin || isAccountant) && (
        <Link to="/payouts" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="gap-1 text-xs h-8 px-2">
            <span className="hidden sm:inline">Pay via </span>Payouts
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      )}
      {expense.status === 'approved' && (isOwner || isAdmin) && (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive h-8 w-8"
          aria-label="Cancel approval"
          title="Cancel Approval"
          onClick={() => handleCancelApproval(expense)}
        >
          <Ban className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Expenses"
        description="Submit and review expense claims"
      />

      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search expenses..."
        action={
          canCreateExpense ? (
            <Link to="/expenses/new">
              <Button className="text-sm sm:text-base px-3 sm:px-4">
                <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New Expense</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          ) : undefined
        }
      />

      <StatusTabs
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          { value: 'all', label: 'All' },
          ...(isStaff ? [{ value: 'draft', label: 'Drafts' }] : []),
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'reimbursed', label: 'Paid' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />

      <div className="mt-1">
        <DataTable
          columns={expenseColumns}
          data={filteredExpenses}
          rowKey={(e) => e.id}
          isLoading={isLoading}
          initialSort={{ columnId: 'date', direction: 'desc' }}
          rowActions={renderExpenseActions}
          actionsHeader="Actions"
          emptyState={
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
          }
        />
      </div>

      {/* Dialogs - No reimbursement dialog anymore */}
      {selectedExpense && (
        <>
          <ExpenseDetailsDialog
            expense={selectedExpense}
            open={showDetailsDialog}
            onOpenChange={setShowDetailsDialog}
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

    </div>
  );
}
