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
import { AlertTriangle, Check, ArrowRight } from 'lucide-react';
import { Calendar, Gift } from 'lucide-react';

interface SettlementSnapshot {
  baseSalary: number;
  leaveDays: number;
  leaveDeduction: number;
  grossSalary: number;
  openingAdvanceBalance: number;
  advanceAdjusted: number;
  closingAdvanceBalance: number;
  netPayable: number;
  systemDeductionDays?: number;
}

interface EnhancedSettlementConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  staffName: string;
  month: string;
  snapshot: SettlementSnapshot;
  paymentMode: string;
  isLoading?: boolean;
}

export function EnhancedSettlementConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  staffName,
  month,
  snapshot,
  paymentMode,
  isLoading,
}: EnhancedSettlementConfirmDialogProps) {
  const hasWarnings = snapshot.leaveDays > 5 || snapshot.openingAdvanceBalance > 0;
  const hasCarryForward = snapshot.closingAdvanceBalance > 0;
  const hasLeaveOverride = snapshot.systemDeductionDays !== undefined && 
    snapshot.leaveDays !== snapshot.systemDeductionDays;
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
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
            <div className="space-y-4 pt-4 text-left">
              {/* Staff & Month Info */}
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

              {/* Salary Calculation */}
              {/* Leave Deduction Summary */}
              {snapshot.leaveDays > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-1.5 text-sm">
                  <p className="font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Leave Deduction
                  </p>
                  {snapshot.systemDeductionDays !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">From approved leaves</span>
                      <span>{snapshot.systemDeductionDays} days</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Final deduction</span>
                    <span className="font-medium">{snapshot.leaveDays} days</span>
                  </div>
                  {hasLeaveOverride && (
                    <div className="flex items-center gap-1.5 text-xs text-primary pt-1">
                      <Gift className="h-3 w-3" />
                      <span>Owner adjusted deduction ({snapshot.systemDeductionDays}d → {snapshot.leaveDays}d)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Salary Breakdown */}
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Salary</span>
                  <Amount value={snapshot.baseSalary} className="text-foreground" />
                </div>
                {snapshot.leaveDeduction > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Leave Deduction ({snapshot.leaveDays} days)</span>
                    <span>- <Amount value={snapshot.leaveDeduction} /></span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Gross Salary</span>
                  <Amount value={snapshot.grossSalary} className="text-foreground" />
                </div>
              </div>

              <Separator />

              {/* Advance Adjustment Section */}
              {snapshot.openingAdvanceBalance > 0 && (
                <>
                  <div className="text-sm space-y-2 p-3 rounded-lg bg-muted/50">
                    <p className="font-medium text-foreground mb-2">Advance Adjustment</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Opening Balance</span>
                      <Amount value={snapshot.openingAdvanceBalance} className="text-warning" />
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>Adjusted This Month</span>
                      <span>- <Amount value={snapshot.advanceAdjusted} /></span>
                    </div>
                    <div className="flex justify-between font-medium pt-1 border-t">
                      <span>Closing Balance (Carry Forward)</span>
                      <Amount 
                        value={snapshot.closingAdvanceBalance} 
                        className={snapshot.closingAdvanceBalance > 0 ? 'text-warning' : 'text-success'} 
                      />
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Net Payable */}
              <div className="flex justify-between items-center py-3 bg-primary/5 rounded-lg px-4">
                <span className="font-semibold text-lg">Net Payable</span>
                <Amount value={snapshot.netPayable} size="lg" className="font-bold text-primary" />
              </div>

              {/* Warnings */}
              {(hasWarnings || hasCarryForward) && (
                <div className="space-y-2">
                  {snapshot.leaveDays > 5 && (
                    <div className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-xs">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>High leave days ({snapshot.leaveDays} days) - please verify</span>
                    </div>
                  )}
                  {hasCarryForward && (
                    <div className="flex items-start gap-2 p-2 rounded bg-info/10 text-info text-xs">
                      <ArrowRight className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        ₹{snapshot.closingAdvanceBalance.toLocaleString('en-IN')} advance will carry forward to next month
                      </span>
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
