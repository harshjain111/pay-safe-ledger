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
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Check } from 'lucide-react';

interface SettlementCalculation {
  monthlySalary: number;
  dailySalary: number;
  leaveDays: number;
  leaveDeduction: number;
  grossSalary: number;
  advancesOutstanding: number;
  netPayable: number;
  excessAdvance: number;
}

interface SettlementConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  staffName: string;
  month: string;
  calculation: SettlementCalculation;
  paymentMode: string;
  isLoading?: boolean;
}

export function SettlementConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  staffName,
  month,
  calculation,
  paymentMode,
  isLoading,
}: SettlementConfirmDialogProps) {
  const hasWarnings = calculation.leaveDays > 5 || calculation.advancesOutstanding > 0;
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-warning" />
            ) : (
              <Check className="h-5 w-5 text-success" />
            )}
            Confirm Salary Settlement
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-4">
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Staff</span>
                  <span className="font-medium text-foreground">{staffName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Month</span>
                  <span className="font-medium text-foreground">{month}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Mode</span>
                  <Badge variant="outline" className="capitalize">
                    {paymentMode.replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Salary</span>
                  <Amount value={calculation.grossSalary} className="text-foreground" />
                </div>
                {calculation.advancesOutstanding > 0 && (
                  <div className="flex justify-between text-warning">
                    <span>Advances Adjusted</span>
                    <span>- <Amount value={Math.min(calculation.advancesOutstanding, calculation.grossSalary)} /></span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Net Payable</span>
                  <Amount value={calculation.netPayable} className="text-primary" />
                </div>
              </div>

              {/* Warnings */}
              {hasWarnings && (
                <div className="space-y-2">
                  {calculation.leaveDays > 5 && (
                    <div className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-xs">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>High leave days ({calculation.leaveDays} days) - please verify</span>
                    </div>
                  )}
                  {calculation.advancesOutstanding > 0 && (
                    <div className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-xs">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>Outstanding advances will be adjusted from salary</span>
                    </div>
                  )}
                  {calculation.excessAdvance > 0 && (
                    <div className="flex items-start gap-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>₹{calculation.excessAdvance.toLocaleString('en-IN')} excess advance will carry forward</span>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                This action is <strong>irreversible</strong>. The settlement will be marked as immutable and cannot be edited.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Confirm Settlement'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
