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
import { AlertTriangle } from 'lucide-react';

interface ZeroPaymentConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  staffName: string;
  month: string;
  reason: string;
  isLoading?: boolean;
}

export function ZeroPaymentConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  staffName,
  month,
  reason,
  isLoading,
}: ZeroPaymentConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5" />
            Zero Payment Confirmation
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-4">
              <p className="text-foreground">
                You are about to settle <strong>{staffName}</strong>'s salary for <strong>{month}</strong> with <strong>₹0</strong> payment.
              </p>
              
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-sm text-warning">
                  <strong>Reason:</strong> {reason}
                </p>
              </div>

              <p className="text-sm text-muted-foreground">
                This will mark the salary as settled but no payment will be recorded. This action cannot be undone.
              </p>

              <p className="text-sm font-medium">
                Are you sure you want to proceed?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm} 
            disabled={isLoading}
            className="bg-warning hover:bg-warning/90"
          >
            {isLoading ? 'Processing...' : 'Confirm Zero Payment'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
