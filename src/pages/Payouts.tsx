import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Amount } from '@/components/ui/amount';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  Receipt, 
  CreditCard, 
  Loader2,
  CheckCircle2,
  Banknote,
  ArrowRight,
  Ban
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { 
  createSalaryPayoutEntry, 
  createAdvancePaidEntry,
  createExpensePayoutEntry 
} from '@/lib/journal-entries';
import { PaidBySelector } from '@/components/payouts/PaidBySelector';
import type { PaymentMode, VoucherType, Expense, PaymentRequest, StaffPublic } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS } from '@/types/database';
import { CancelApprovalDialog } from '@/components/expenses/CancelApprovalDialog';

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'petty_cash', label: 'Petty Cash' },
];

interface ApprovedExpense extends Expense {
  staff: StaffPublic;
}

interface ApprovedRequest extends Omit<PaymentRequest, 'payout_type' | 'settlement_id'> {
  staff: StaffPublic;
  payout_type?: string | null;
  settlement_id?: string | null;
}

type PayoutItem = {
  id: string;
  type: 'expense' | 'advance' | 'salary';
  staffName: string;
  staffId: string;
  employeeId: string;
  staffUserId?: string | null;
  amount: number;
  description: string;
  category?: string;
  date: string;
  referenceMonth?: string;
  settlementId?: string;
  approvedByUserName?: string | null;
};

export default function Payouts() {
  const { user, staffData, isOwner, isAdmin, isAccountant, isStaff, canRecordSalaryPayments } = useAuth();
  
  // Access check - Staff cannot execute payouts
  const canExecutePayout = isOwner || isAdmin || isAccountant;
  
  const [activeTab, setActiveTab] = useState<'all' | 'expenses' | 'advances' | 'salary'>('all');
  const [approvedExpenses, setApprovedExpenses] = useState<ApprovedExpense[]>([]);
  const [approvedAdvances, setApprovedAdvances] = useState<ApprovedRequest[]>([]);
  const [pendingSalaries, setPendingSalaries] = useState<ApprovedRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Payout dialog state
  const [selectedItem, setSelectedItem] = useState<PayoutItem | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidBy, setPaidBy] = useState<{ userId: string; userName: string } | null>(null);
  const [pettyCashBalance, setPettyCashBalance] = useState<number>(0);
  const [cancelItem, setCancelItem] = useState<PayoutItem | null>(null);

  useEffect(() => {
    if (canExecutePayout) {
      fetchApprovedItems();
      fetchPettyCashBalance();
    } else {
      setIsLoading(false);
    }
  }, [canExecutePayout]);

  const fetchPettyCashBalance = async () => {
    try {
      const { data, error } = await (supabase.from as any)('petty_cash_transactions')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!error && data && data.length > 0) {
        setPettyCashBalance(data[0].balance_after);
      }
    } catch (e) {
      console.error('Failed to fetch petty cash balance:', e);
    }
  };

  const fetchApprovedItems = async () => {
    setIsLoading(true);
    try {
      // Fetch approved expenses (not yet reimbursed)
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select(`
          *,
          staff:staff_id(*)
        `)
        .eq('status', 'approved')
        .order('approved_at', { ascending: true });

      if (expensesError) throw expensesError;
      setApprovedExpenses((expensesData || []) as unknown as ApprovedExpense[]);

      // Fetch approved ADVANCE requests (payout_type = 'advance' or null, not yet paid)
      const { data: advanceData, error: advanceError } = await supabase
        .from('payment_requests')
        .select(`
          *,
          staff:staff_id(*)
        `)
        .eq('status', 'approved')
        .is('paid_at', null)
        .or('payout_type.is.null,payout_type.eq.advance')
        .order('approved_at', { ascending: true });

      if (advanceError) throw advanceError;
      setApprovedAdvances((advanceData || []) as unknown as ApprovedRequest[]);

      // Fetch pending SALARY payout requests (Owner only, payout_type = 'salary')
      if (canRecordSalaryPayments) {
        const { data: salaryData, error: salaryError } = await supabase
          .from('payment_requests')
          .select(`
            *,
            staff:staff_id(*)
          `)
          .eq('status', 'approved')
          .eq('payout_type', 'salary')
          .is('paid_at', null)
          .order('approved_at', { ascending: true });

        if (salaryError) throw salaryError;
        setPendingSalaries((salaryData || []) as unknown as ApprovedRequest[]);
      }
    } catch (error) {
      console.error('Error fetching approved items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load approved items',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecutePayout = async () => {
    if (!selectedItem || !user) return;

    setIsProcessing(true);
    try {
      let journalEntryId: string;
      
      // Use selected paid_by or default to current user
      const paidByUserId = paidBy?.userId || user.id;
      const paidByUserName = paidBy?.userName || getUserDisplayName(user, staffData);

      // ========================================
      // DOUBLE-ENTRY ACCOUNTING: PAYOUT ENTRIES
      // ========================================
      // All payouts follow the same pattern:
      // - Debit: Staff Payable / Staff Advances (clear liability/reduce receivable)
      // - Credit: Bank/Cash (money goes out)
      // 
      // This ensures staff balance goes to ZERO after payout

      if (selectedItem.type === 'salary') {
        // SALARY PAYOUT
        // Debit: Staff Payable (clear the liability created during settlement)
        // Credit: Bank/Cash (money out)
        
        // Extract month from description (format: "Salary for MMMM yyyy")
        const monthMatch = selectedItem.description.match(/Salary for (.+)/);
        const settlementMonth = monthMatch ? monthMatch[1] : format(new Date(), 'MMMM yyyy');

        journalEntryId = await createSalaryPayoutEntry({
          staffId: selectedItem.staffId,
          staffName: selectedItem.staffName,
          settlementMonth,
          netPayable: selectedItem.amount,
          paymentMode,
          settlementId: selectedItem.settlementId || '',
          paymentRequestId: selectedItem.id,
          createdBy: user.id,
          paidByUserId,
          paidByUserName,
        });

        // Update salary settlement with payout journal entry
        if (selectedItem.settlementId) {
          await supabase
            .from('salary_settlements')
            .update({
              paid_at: new Date().toISOString(),
              paid_by: paidByUserId,
              paid_by_user_name: paidByUserName,
              payment_mode: paymentMode,
              payout_journal_entry_id: journalEntryId,
            })
            .eq('id', selectedItem.settlementId);
        }

      } else if (selectedItem.type === 'advance') {
        // ADVANCE PAYOUT
        // Debit: Staff Advances (staff now owes us this amount)
        // Credit: Bank/Cash (money out)
        
        journalEntryId = await createAdvancePaidEntry({
          staffId: selectedItem.staffId,
          staffName: selectedItem.staffName,
          amount: selectedItem.amount,
          paymentMode,
          paymentRequestId: selectedItem.id,
          createdBy: user.id,
          paidByUserId,
          paidByUserName,
        });

      } else {
        // EXPENSE PAYOUT
        // Debit: Staff Payable (clear the liability created during approval)
        // Credit: Bank/Cash (money out)
        
        journalEntryId = await createExpensePayoutEntry({
          staffId: selectedItem.staffId,
          staffName: selectedItem.staffName,
          expenseId: selectedItem.id,
          amount: selectedItem.amount,
          paymentMode,
          createdBy: user.id,
          paidByUserId,
          paidByUserName,
        });
      }

      // Record petty cash transaction if paid via petty cash
      if (paymentMode === 'petty_cash' && user) {
        const newPcBalance = pettyCashBalance - selectedItem.amount;
        const pcType = selectedItem.type === 'expense' ? 'expense_payment' : 'advance_payment';
        await (supabase.from as any)('petty_cash_transactions').insert({
          transaction_type: pcType,
          amount: selectedItem.amount,
          balance_after: newPcBalance,
          reference_type: selectedItem.type === 'expense' ? 'expense' : 'payment_request',
          reference_id: selectedItem.id,
          notes: `${selectedItem.description} - ${selectedItem.staffName}`,
          created_by: user.id,
        });
        setPettyCashBalance(newPcBalance);
      }

      // NOTE: ledger_entry_id references legacy ledger_entries table
      // Journal entries are tracked separately via journal_entry_id where applicable
      if (selectedItem.type === 'expense') {
        const { error: updateError } = await supabase
          .from('expenses')
          .update({
            status: 'reimbursed',
            reimbursed_at: new Date().toISOString(),
            reimbursed_by: paidByUserId,
            reimbursed_by_user_name: paidByUserName,
            // Don't set ledger_entry_id - it references legacy ledger_entries table
            // The payout is tracked via journal_entries
          })
          .eq('id', selectedItem.id);

        if (updateError) throw updateError;
      } else if (selectedItem.type === 'advance' || selectedItem.type === 'salary') {
        // Mark payment request as paid
        const { error: updateError } = await supabase
          .from('payment_requests')
          .update({
            paid_at: new Date().toISOString(),
            paid_by: paidByUserId,
            paid_by_user_name: paidByUserName,
            // Don't set ledger_entry_id - it references legacy ledger_entries table
            // The payout is tracked via journal_entries
          })
          .eq('id', selectedItem.id);

        if (updateError) throw updateError;
      }

      // Notify the staff member
      if (selectedItem.staffUserId) {
        const typeLabel = selectedItem.type === 'expense' 
          ? 'Expense Reimbursed' 
          : selectedItem.type === 'advance' 
            ? 'Advance Paid' 
            : 'Salary Paid';
        
        const message = selectedItem.type === 'expense'
          ? `Your expense of ₹${selectedItem.amount.toLocaleString('en-IN')} has been reimbursed.`
          : selectedItem.type === 'advance'
            ? `Your advance request of ₹${selectedItem.amount.toLocaleString('en-IN')} has been paid.`
            : `Your salary of ₹${selectedItem.amount.toLocaleString('en-IN')} has been paid.`;

        await supabase.rpc('create_notification', {
          _user_id: selectedItem.staffUserId,
          _title: typeLabel,
          _message: message,
          _type: 'success',
          _reference_type: 'journal_entry',
          _reference_id: journalEntryId,
        });
      }

      toast({
        title: 'Payout Successful',
        description: `₹${selectedItem.amount.toLocaleString('en-IN')} paid to ${selectedItem.staffName}. Balance cleared.`,
      });




      setSelectedItem(null);
      setPaymentMode('cash');
      setPaidBy(null);
      fetchApprovedItems();
    } catch (error: any) {
      console.error('Error executing payout:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to execute payout. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openPayoutDialog = (item: PayoutItem) => {
    setSelectedItem(item);
    setPaymentMode('cash');
    setPaidBy(null); // Will be set to current user by PaidBySelector
  };

  // Convert data to unified PayoutItem format
  const getPayoutItems = (): PayoutItem[] => {
    const items: PayoutItem[] = [];

    // Add expenses
    if (activeTab === 'all' || activeTab === 'expenses') {
      approvedExpenses.forEach(expense => {
        items.push({
          id: expense.id,
          type: 'expense',
          staffName: expense.staff?.full_name || 'Unknown',
          staffId: expense.staff_id,
          employeeId: expense.staff?.employee_id || '',
          staffUserId: expense.staff?.user_id,
          amount: expense.amount,
          description: `Expense: ${expense.description}`,
          category: EXPENSE_CATEGORY_LABELS[expense.category],
          date: expense.approved_at || expense.expense_date,
          approvedByUserName: expense.approved_by_user_name,
        });
      });
    }

    // Add advance requests
    if (activeTab === 'all' || activeTab === 'advances') {
      approvedAdvances.forEach(request => {
        items.push({
          id: request.id,
          type: 'advance',
          staffName: request.staff?.full_name || 'Unknown',
          staffId: request.staff_id,
          employeeId: request.staff?.employee_id || '',
          staffUserId: request.staff?.user_id,
          amount: request.amount,
          description: `Advance: ${request.reason}`,
          date: request.approved_at || request.created_at,
          approvedByUserName: request.approved_by_user_name,
        });
      });
    }

    // Add salary payout requests (Owner only)
    if ((activeTab === 'all' || activeTab === 'salary') && canRecordSalaryPayments) {
      pendingSalaries.forEach(salary => {
        // Extract reference month from reason (format: "Salary for MMMM yyyy")
        const monthMatch = salary.reason.match(/Salary for (.+)/);
        const refMonth = monthMatch ? monthMatch[1] : '';
        
        items.push({
          id: salary.id,
          type: 'salary',
          staffName: salary.staff?.full_name || 'Unknown',
          staffId: salary.staff_id,
          employeeId: salary.staff?.employee_id || '',
          staffUserId: salary.staff?.user_id,
          amount: salary.amount,
          description: salary.reason,
          date: salary.approved_at || salary.created_at,
          settlementId: salary.settlement_id,
          approvedByUserName: salary.approved_by_user_name,
        });
      });
    }

    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const payoutItems = getPayoutItems();
  const totalPending = approvedExpenses.length + approvedAdvances.length + (canRecordSalaryPayments ? pendingSalaries.length : 0);

  // Access denied for staff
  if (isStaff || !canExecutePayout) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Wallet className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">
          Only authorized personnel can execute payouts.
        </p>
      </div>
    );
  }

  const getTypeIcon = (type: PayoutItem['type']) => {
    switch (type) {
      case 'expense': return Receipt;
      case 'advance': return Banknote;
      case 'salary': return Wallet;
    }
  };

  const getTypeBadgeVariant = (type: PayoutItem['type']) => {
    switch (type) {
      case 'expense': return 'outline';
      case 'advance': return 'secondary';
      case 'salary': return 'default';
    }
  };

  const getTypeLabel = (type: PayoutItem['type']) => {
    switch (type) {
      case 'expense': return 'Expense';
      case 'advance': return 'Advance';
      case 'salary': return 'Salary';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Payouts"
        description="Execute approved payments"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <Card>
          <CardContent className="p-4 md:pt-6">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2 md:p-3 rounded-lg bg-primary/10">
                <Receipt className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Expenses</p>
                <p className="text-xl md:text-2xl font-bold">{approvedExpenses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:pt-6">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2 md:p-3 rounded-lg bg-accent/50">
                <Banknote className="h-4 w-4 md:h-5 md:w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Advances</p>
                <p className="text-xl md:text-2xl font-bold">{approvedAdvances.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {canRecordSalaryPayments && (
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 rounded-lg bg-secondary">
                  <Wallet className="h-4 w-4 md:h-5 md:w-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Salaries</p>
                  <p className="text-xl md:text-2xl font-bold">{pendingSalaries.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
          <TabsTrigger value="all" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
            All ({totalPending})
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
            Expenses ({approvedExpenses.length})
          </TabsTrigger>
          <TabsTrigger value="advances" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
            Advances ({approvedAdvances.length})
          </TabsTrigger>
          {canRecordSalaryPayments && (
            <TabsTrigger value="salary" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
              Salary ({pendingSalaries.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payoutItems.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No pending payouts"
              description="All approved items have been paid. Check the Requests page to approve new items."
            />
          ) : (
            <div className="grid gap-3 sm:gap-4">
              {payoutItems.map((item) => {
                const TypeIcon = getTypeIcon(item.type);
                return (
                  <Card key={`${item.type}-${item.id}`} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col gap-3">
                        {/* Top row: Type badge + Amount */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="p-1.5 sm:p-2 rounded-lg bg-muted shrink-0">
                              <TypeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                <Badge variant={getTypeBadgeVariant(item.type)} className="text-[10px] sm:text-xs">
                                  {getTypeLabel(item.type)}
                                </Badge>
                                {item.category && (
                                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                                    {item.category}
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-sm sm:text-base mt-0.5">{item.staffName}</p>
                            </div>
                          </div>
                          <Amount value={item.amount} className="text-base sm:text-lg font-semibold shrink-0" />
                        </div>
                        
                        {/* Description */}
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                        
                        {/* Bottom row: Approved info + Pay button */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <p className="text-[10px] sm:text-xs text-muted-foreground">
                              Approved: {item.date ? format(new Date(item.date), 'dd MMM') : '-'}
                            </p>
                            {item.approvedByUserName && (
                              <p className="text-[10px] sm:text-xs text-muted-foreground italic">
                                by {item.approvedByUserName}
                              </p>
                            )}
                          </div>
                          {(isOwner || isAdmin) && item.type !== 'salary' && (
                            <Button 
                              onClick={() => setCancelItem(item)}
                              size="sm"
                              variant="outline"
                              className="shrink-0 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 text-destructive hover:text-destructive border-destructive/30"
                              title="Cancel Approval"
                            >
                              <Ban className="mr-1 h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          )}
                          <Button 
                            onClick={() => openPayoutDialog(item)}
                            size="sm"
                            className="shrink-0 text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4"
                          >
                            <CreditCard className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            Pay
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Payout Confirmation Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Execute Payout</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Confirm payment details
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant={getTypeBadgeVariant(selectedItem.type)} className="text-[10px] sm:text-xs">
                    {getTypeLabel(selectedItem.type)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Staff</span>
                  <span className="font-medium text-right truncate max-w-[150px] sm:max-w-[200px]">{selectedItem.staffName}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-muted-foreground shrink-0">Description</span>
                  <span className="text-right line-clamp-2 text-[10px] sm:text-xs">{selectedItem.description}</span>
                </div>
                {selectedItem.approvedByUserName && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Approved By</span>
                    <span className="font-medium text-right">{selectedItem.approvedByUserName}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Amount</span>
                  <Amount value={selectedItem.amount} className="text-base sm:text-lg font-bold text-primary" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {PAYMENT_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {paymentMode === 'petty_cash' && selectedItem && (
                  <div className={`mt-2 p-2 rounded-lg text-xs ${
                    pettyCashBalance < selectedItem.amount 
                      ? 'bg-destructive/10 text-destructive' 
                      : 'bg-muted/50 text-muted-foreground'
                  }`}>
                    <p>Petty Cash Balance: ₹{pettyCashBalance.toLocaleString('en-IN')}</p>
                    {pettyCashBalance < selectedItem.amount && (
                      <p className="font-medium mt-1">Insufficient petty cash balance!</p>
                    )}
                  </div>
                )}
              </div>

              <PaidBySelector
                value={paidBy}
                onChange={setPaidBy}
                disabled={isProcessing}
              />

              <div className="p-2 sm:p-3 rounded-lg bg-muted/50 text-[10px] sm:text-sm text-muted-foreground">
                <p>
                  Creates an immutable ledger entry and marks as paid.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSelectedItem(null)} disabled={isProcessing} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleExecutePayout} disabled={isProcessing || (paymentMode === 'petty_cash' && !!selectedItem && pettyCashBalance < selectedItem.amount)} className="w-full sm:w-auto">
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Approval Dialog */}
      <CancelApprovalDialog
        open={!!cancelItem}
        onOpenChange={(open) => !open && setCancelItem(null)}
        onSuccess={() => {
          setCancelItem(null);
          fetchApprovedItems();
        }}
        item={cancelItem ? {
          id: cancelItem.id,
          type: cancelItem.type as 'expense' | 'advance',
          staffName: cancelItem.staffName,
          staffId: cancelItem.staffId,
          staffUserId: cancelItem.staffUserId,
          amount: cancelItem.amount,
          description: cancelItem.description,
        } : null}
      />
    </div>
  );
}