import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Amount } from '@/components/ui/amount';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import type { Expense } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS } from '@/types/database';
import { refetchNotificationCounts } from '@/hooks/useNotificationCounts';

interface RejectExpenseDialogProps {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RejectExpenseDialog({
  expense,
  open,
  onOpenChange,
  onSuccess,
}: RejectExpenseDialogProps) {
  const { user, staffData } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  const handleReject = async () => {
    // Prevent self-rejection — cannot reject an expense where YOU are the
    // beneficiary (mirrors the approve guard, which checks the beneficiary).
    if (expense.staff?.user_id === user?.id) {
      toast({
        title: 'Cannot reject',
        description: 'You cannot reject expenses where you are the beneficiary.',
        variant: 'destructive',
      });
      onOpenChange(false);
      return;
    }

    if (!reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a reason for rejection.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const approverName = getUserDisplayName(user, staffData);

      const { data: claimed, error } = await supabase
        .from('expenses')
        .update({
          status: 'rejected',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
          approved_by_user_name: approverName,
        })
        .eq('id', expense.id)
        .eq('status', 'pending')
        .select('id');

      if (error) throw error;
      if (!claimed || claimed.length === 0) throw new Error('This expense was already actioned.');

      // Notify the staff member about rejection
      if (expense.staff?.user_id) {
        await supabase.rpc('create_notification', {
          _user_id: expense.staff.user_id,
          _title: 'Expense Rejected',
          _message: `Your expense of ₹${expense.amount.toLocaleString('en-IN')} has been rejected. Reason: ${reason.trim()}`,
          _type: 'error',
          _reference_type: 'expense',
          _reference_id: expense.id,
        });
      }

      toast({
        title: 'Expense rejected',
        description: 'The expense has been rejected.',
      });

      // Immediately update notification counts
      refetchNotificationCounts();

      setReason('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error rejecting expense:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject expense. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Expense</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <div className="bg-muted p-3 rounded-md space-y-1 text-foreground">
                <p><strong>Staff:</strong> {expense.staff?.full_name}</p>
                <p><strong>Category:</strong> {EXPENSE_CATEGORY_LABELS[expense.category]}</p>
                <p><strong>Description:</strong> {expense.description}</p>
                <p className="flex items-center gap-2">
                  <strong>Amount:</strong> 
                  <Amount value={expense.amount} />
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reason">Rejection Reason *</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide a reason for rejection..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={handleReject}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Rejecting...' : 'Reject Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
