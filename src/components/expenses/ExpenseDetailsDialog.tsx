import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/ui/amount';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import type { Expense } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExpenseDetailsDialogProps {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseDetailsDialog({
  expense,
  open,
  onOpenChange,
}: ExpenseDetailsDialogProps) {
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [isLoadingProof, setIsLoadingProof] = useState(false);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (expense.proof_url && open) {
        setIsLoadingProof(true);
        try {
          // Use signed URL for private bucket
          const { data, error } = await supabase.storage
            .from('expense-proofs')
            .createSignedUrl(expense.proof_url, 3600); // 1 hour expiry
          
          if (error) {
            console.error('Error getting signed URL:', error);
            return;
          }
          
          setProofUrl(data.signedUrl);
        } catch (error) {
          console.error('Error fetching proof URL:', error);
        } finally {
          setIsLoadingProof(false);
        }
      }
    };

    fetchSignedUrl();
  }, [expense.proof_url, open]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground';
      case 'pending': return 'bg-warning/20 text-warning';
      case 'approved': return 'bg-info/20 text-info';
      case 'rejected': return 'bg-destructive/20 text-destructive';
      case 'reimbursed': return 'bg-success/20 text-success';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Expense Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status & Amount */}
          <div className="flex items-center justify-between">
            <Badge className={getStatusColor(expense.status)}>
              {EXPENSE_STATUS_LABELS[expense.status]}
            </Badge>
            <Amount value={expense.amount} size="lg" className="text-foreground" />
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="col-span-2">
              <p className="text-muted-foreground">Staff Member</p>
              <p className="font-medium">{expense.staff?.full_name || 'Unknown Staff'}</p>
              {expense.staff?.employee_id && (
                <p className="text-xs text-muted-foreground">{expense.staff.employee_id}</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="font-medium">{EXPENSE_CATEGORY_LABELS[expense.category]}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Date</p>
              <p className="font-medium">{format(new Date(expense.expense_date), 'dd MMM yyyy')}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">Description</p>
              <p className="font-medium">{expense.description}</p>
            </div>
          </div>

          {/* Proof */}
          {expense.proof_url && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Proof / Receipt</p>
                {isLoadingProof ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    Loading...
                  </div>
                ) : proofUrl ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={proofUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="mr-2 h-4 w-4" />
                      View Attachment
                      <ExternalLink className="ml-2 h-3 w-3" />
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Unable to load attachment</p>
                )}
              </div>
            </>
          )}

          {/* Rejection Reason */}
          {expense.status === 'rejected' && expense.rejection_reason && (
            <>
              <Separator />
              <div className="bg-destructive/10 p-3 rounded-md">
                <p className="text-sm text-muted-foreground">Rejection Reason</p>
                <p className="text-sm font-medium text-destructive">
                  {expense.rejection_reason}
                </p>
              </div>
            </>
          )}

          {/* Approved/Rejected By */}
          {expense.approved_by_user_name && (
            <>
              <Separator />
              <div className="text-sm">
                <p className="text-muted-foreground">
                  {expense.status === 'rejected' ? 'Rejected by' : 'Approved by'}
                </p>
                <p className="font-medium">{expense.approved_by_user_name}</p>
              </div>
            </>
          )}

          {/* Timeline */}
          <Separator />
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Created: {format(new Date(expense.created_at), 'dd MMM yyyy, hh:mm a')}</p>
            {expense.submitted_at && (
              <p>Submitted: {format(new Date(expense.submitted_at), 'dd MMM yyyy, hh:mm a')}</p>
            )}
            {expense.approved_at && (
              <p>Approved: {format(new Date(expense.approved_at), 'dd MMM yyyy, hh:mm a')}</p>
            )}
            {expense.reimbursed_at && (
              <p>Reimbursed: {format(new Date(expense.reimbursed_at), 'dd MMM yyyy, hh:mm a')}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
