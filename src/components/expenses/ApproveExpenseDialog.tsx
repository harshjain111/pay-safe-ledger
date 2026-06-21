import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Amount } from '@/components/ui/amount';
import { createExpenseApprovalEntry } from '@/lib/journal-entries';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import type { Expense } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS } from '@/types/database';
import { refetchNotificationCounts } from '@/hooks/useNotificationCounts';
import { queryKeys } from '@/lib/query-keys';

interface ApproveExpenseDialogProps {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ApproveExpenseDialog({
  expense,
  open,
  onOpenChange,
  onSuccess,
}: ApproveExpenseDialogProps) {
  const { user, staffData } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    // Prevent self-approval - cannot approve expense where YOU are the beneficiary (staff)
    // This checks if the approver's user_id matches the staff's user_id, not who created it
    // Owners/Admins CAN approve expenses they created on behalf of other staff
    if (expense.staff?.user_id === user?.id) {
      toast({
        title: 'Cannot approve',
        description: 'You cannot approve expenses where you are the beneficiary.',
        variant: 'destructive',
      });
      onOpenChange(false);
      return;
    }

    if (!user?.id) return;

    try {
      setIsSubmitting(true);

      const approverName = getUserDisplayName(user, staffData);

      // Claim-first: flip the status only if it is STILL pending, so a double-click
      // or a second reviewer cannot re-post the approval journal (double accrual).
      const { data: claimed, error: claimErr } = await supabase
        .from('expenses')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          approved_by_user_name: approverName,
        })
        .eq('id', expense.id)
        .eq('status', 'pending')
        .select('id');
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) throw new Error('This expense was already actioned.');

      // DOUBLE-ENTRY: Dr Expense head / Cr Staff Payable. Post it now that we own the
      // row; if it fails, revert the claim so the expense can be retried.
      try {
        await createExpenseApprovalEntry({
          staffId: expense.staff_id,
          staffName: expense.staff?.full_name || 'Staff',
          expenseId: expense.id,
          amount: expense.amount,
          category: expense.category,
          description: expense.description,
          createdBy: user.id,
        });
      } catch (e) {
        await supabase.from('expenses')
          .update({ status: 'pending', approved_by: null, approved_at: null, approved_by_user_name: null })
          .eq('id', expense.id);
        throw e;
      }

      // Notify the staff member
      if (expense.staff?.user_id) {
        await supabase.rpc('create_notification', {
          _user_id: expense.staff.user_id,
          _title: 'Expense Approved',
          _message: `Your expense of ₹${expense.amount.toLocaleString('en-IN')} has been approved and is awaiting reimbursement.`,
          _type: 'success',
          _reference_type: 'expense',
          _reference_id: expense.id,
        });
      }

      // Notify accountants for reimbursement (server-side fan-out).
      await supabase.rpc('notify_users_by_role', {
        _roles: ['accountant'],
        _title: 'Expense Ready for Reimbursement',
        _message: `An expense of ₹${expense.amount.toLocaleString('en-IN')} by ${expense.staff?.full_name || 'Staff'} has been approved and is ready for reimbursement.`,
        _type: 'info',
        _reference_type: 'expense',
        _reference_id: expense.id,
      });

      toast({
        title: 'Expense approved',
        description: 'The expense has been approved for reimbursement. Journal entry created.',
      });

      // Refresh balance-derived views now that approval created a staff payable
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staffBalance.byStaff(expense.staff_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.byStaff(expense.staff_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.advancesOutstanding.all });

      // Immediately update notification counts
      refetchNotificationCounts();

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error approving expense:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve expense. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve Expense</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>Are you sure you want to approve this expense?</p>
              <div className="bg-muted p-3 rounded-md space-y-1">
                <p><strong>Staff:</strong> {expense.staff?.full_name}</p>
                <p><strong>Category:</strong> {EXPENSE_CATEGORY_LABELS[expense.category]}</p>
                <p><strong>Description:</strong> {expense.description}</p>
                <p className="flex items-center gap-2">
                  <strong>Amount:</strong> 
                  <Amount value={expense.amount} />
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                This will create a journal entry recording the expense and staff payable.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleApprove}
            disabled={isSubmitting}
            className="bg-success hover:bg-success/90"
          >
            {isSubmitting ? 'Approving...' : 'Approve'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
