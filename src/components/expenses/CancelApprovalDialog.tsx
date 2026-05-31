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
import { Amount } from '@/components/ui/amount';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { createCancellationReversalEntry } from '@/lib/journal-entries';

interface CancelApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  item: {
    id: string;
    type: 'expense' | 'advance';
    staffName: string;
    staffId: string;
    staffUserId?: string | null;
    amount: number;
    description: string;
  } | null;
}

export function CancelApprovalDialog({
  open,
  onOpenChange,
  onSuccess,
  item,
}: CancelApprovalDialogProps) {
  const { user, staffData } = useAuth();
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCancel = async () => {
    if (!item || !user || !reason.trim()) return;

    setIsProcessing(true);
    try {
      const cancellerName = getUserDisplayName(user, staffData);

      if (item.type === 'expense') {
        // Find the journal entry created during expense approval
        const { data: journalEntries, error: jeError } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('reference_id', item.id)
          .eq('transaction_type', 'expense_approval')
          .order('created_at', { ascending: false })
          .limit(1);

        if (jeError) throw jeError;

        // If there's a journal entry, create a reversal
        if (journalEntries && journalEntries.length > 0) {
          await createCancellationReversalEntry({
            originalJournalEntryId: journalEntries[0].id,
            staffId: item.staffId,
            staffName: item.staffName,
            reason,
            createdBy: user.id,
            cancelledByUserName: cancellerName,
          });
        }

        // Reset expense status back to pending
        const { error: updateError } = await supabase
          .from('expenses')
          .update({
            status: 'pending',
            approved_by: null,
            approved_at: null,
            approved_by_user_name: null,
          })
          .eq('id', item.id);

        if (updateError) throw updateError;

      } else if (item.type === 'advance') {
        // Advance approval doesn't create journal entries, just reset status
        const { error: updateError } = await supabase
          .from('payment_requests')
          .update({
            status: 'pending',
            approved_by: null,
            approved_at: null,
            approved_by_user_name: null,
          })
          .eq('id', item.id);

        if (updateError) throw updateError;
      }

      // Notify the staff member
      if (item.staffUserId) {
        await supabase.rpc('create_notification', {
          _user_id: item.staffUserId,
          _title: 'Approval Cancelled',
          _message: `Your ${item.type} of ₹${item.amount.toLocaleString('en-IN')} approval has been cancelled. Reason: ${reason}`,
          _type: 'warning',
          _reference_type: item.type === 'expense' ? 'expense' : 'payment_request',
          _reference_id: item.id,
        });
      }

      toast({
        title: 'Approval Cancelled',
        description: `The ${item.type} approval has been reversed and the item is back to pending.`,
      });

      setReason('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error cancelling approval:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel approval.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancel Approval
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            This will reverse the approval and undo any journal entries created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
            <p><strong>Type:</strong> {item.type === 'expense' ? 'Expense' : 'Advance'}</p>
            <p><strong>Staff:</strong> {item.staffName}</p>
            <p><strong>Description:</strong> {item.description}</p>
            <p className="flex items-center gap-2">
              <strong>Amount:</strong> <Amount value={item.amount} />
            </p>
          </div>

          <div className="space-y-2">
            <Label>Reason for cancellation *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this approval being cancelled?"
              rows={3}
            />
          </div>

          <div className="p-2 sm:p-3 rounded-lg bg-destructive/10 text-[10px] sm:text-xs text-destructive">
            <p className="font-medium">⚠️ This action will:</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              <li>Reverse the approval and set status back to Pending</li>
              {item.type === 'expense' && <li>Create a cancellation journal entry to undo the accounting impact</li>}
              <li>Record this action in the audit log with your reason</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing} className="w-full sm:w-auto">
            Go Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isProcessing || !reason.trim()}
            className="w-full sm:w-auto"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              'Confirm Cancellation'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
