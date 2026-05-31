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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Amount } from '@/components/ui/amount';
import { AlertTriangle, RotateCcw, ArrowRight } from 'lucide-react';
import { createRectificationEntry } from '@/lib/journal-entries';
import { toast } from '@/hooks/use-toast';

interface JournalLineInfo {
  id: string;
  debit: number;
  credit: number;
  description: string | null;
  staff_id: string | null;
  account: {
    code: string;
    name: string;
    account_type: string;
  } | null;
}

interface RectificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journalEntryId: string;
  referenceNo: string;
  description: string;
  transactionType: string;
  staffId: string;
  staffName: string;
  lines: JournalLineInfo[];
  userId: string;
  onSuccess: () => void;
}

export function RectificationDialog({
  open,
  onOpenChange,
  journalEntryId,
  referenceNo,
  description,
  transactionType,
  staffId,
  staffName,
  lines,
  userId,
  onSuccess,
}: RectificationDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for rectification.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      await createRectificationEntry({
        originalJournalEntryId: journalEntryId,
        staffId,
        staffName,
        reason: reason.trim(),
        createdBy: userId,
      });

      toast({
        title: 'Rectification Entry Created',
        description: `Reversal entry for ${referenceNo} has been posted to the ledger.`,
      });

      setReason('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Rectification error:', error);
      toast({
        title: 'Rectification Failed',
        description: error.message || 'Failed to create rectification entry.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-warning" />
            Rectification Entry
          </DialogTitle>
          <DialogDescription>
            This will create an equal and opposite reversal entry to correct the original transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original Entry Info */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-sm">
            <p className="font-medium">Original Entry: {referenceNo}</p>
            <p className="text-muted-foreground">{description}</p>
            <Badge variant="outline" className="text-xs capitalize">
              {transactionType.replace(/_/g, ' ')}
            </Badge>
          </div>

          <Separator />

          {/* Show original lines and what the reversal will look like */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Original Lines → Reversal</Label>
            {lines.filter(l => l.staff_id).map((line, i) => (
              <div key={i} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                <div className="flex-1">
                  <span className="text-muted-foreground">{line.account?.name || 'Unknown'}</span>
                  <div className="flex items-center gap-1 text-xs">
                    {Number(line.debit) > 0 && (
                      <span className="text-destructive">Dr ₹{Number(line.debit).toLocaleString('en-IN')}</span>
                    )}
                    {Number(line.credit) > 0 && (
                      <span className="text-success">Cr ₹{Number(line.credit).toLocaleString('en-IN')}</span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 text-right">
                  <span className="text-muted-foreground">Reversed</span>
                  <div className="flex items-center justify-end gap-1 text-xs">
                    {Number(line.credit) > 0 && (
                      <span className="text-destructive">Dr ₹{Number(line.credit).toLocaleString('en-IN')}</span>
                    )}
                    {Number(line.debit) > 0 && (
                      <span className="text-success">Cr ₹{Number(line.debit).toLocaleString('en-IN')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Rectification *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Expense was wrongly recorded as advance"
              rows={3}
            />
          </div>

          <Alert className="border-warning/30 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning text-xs">
              This action is <strong>irreversible</strong>. The rectification entry will be marked as immutable and permanently recorded in the ledger for audit purposes.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !reason.trim()}>
            {isSubmitting ? 'Processing...' : 'Post Rectification Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
