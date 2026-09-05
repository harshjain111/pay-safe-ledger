import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toAmount } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { LeaveRecord } from '@/types/leave';
import { NotificationEvents } from '@/lib/notifications';
import { fetchLeaveTypes, computeLeaveBalancesForStaff, type LeaveTypeRow } from '@/lib/leave';

interface LeaveApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaveRecord: LeaveRecord | null;
  onSuccess: () => void;
}

export function LeaveApprovalDialog({
  open,
  onOpenChange,
  leaveRecord,
  onSuccess,
}: LeaveApprovalDialogProps) {
  const { user } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeRow[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [deductionDays, setDeductionDays] = useState(0);
  // The deduction follows the leave type. Overriding is deliberate and rare
  // (half a day, or a paid type approved with no balance left), so it is behind
  // a switch instead of sitting there as an editable number that silently
  // contradicts the type above it.
  const [overrideDeduction, setOverrideDeduction] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType = leaveTypes.find((t) => t.id === selectedTypeId) ?? null;

  useEffect(() => {
    if (!open) return;
    (async () => {
      const types = await fetchLeaveTypes(true);
      setLeaveTypes(types);
      if (leaveRecord) {
        const fallback = types.find((t) => t.is_default) ?? types[0];
        setSelectedTypeId(leaveRecord.leave_type_id ?? fallback?.id ?? '');
      }
    })();
  }, [open, leaveRecord]);

  useEffect(() => {
    if (leaveRecord) {
      setRejectionReason('');
      setOverrideDeduction(false);
    }
  }, [leaveRecord]);

  // The type decides the deduction. Note this deliberately IGNORES the value
  // stored on the request: leave_records.deduction_days defaults to 1 in the
  // database, so a request raised from the employee app arrives claiming a
  // day's deduction whatever it is actually for — that default must not
  // survive into an approved paid leave.
  useEffect(() => {
    if (selectedType && !overrideDeduction) setDeductionDays(selectedType.default_deduction);
  }, [selectedType, overrideDeduction]);

  // How much of this type the employee has left, for types that accrue. The
  // common reason to override is approving a paid leave they have no balance
  // for, so the number belongs on screen at the moment of the decision.
  useEffect(() => {
    let cancelled = false;
    if (!open || !leaveRecord?.staff_id || !selectedType || selectedType.accrual === 'none') {
      setBalance(null);
      return;
    }
    (async () => {
      const rows = await computeLeaveBalancesForStaff(leaveRecord.staff_id).catch(() => []);
      if (cancelled) return;
      const row = rows.find((r) => r.type.id === selectedType.id);
      setBalance(row ? row.balance : null);
    })();
    return () => { cancelled = true; };
  }, [open, leaveRecord?.staff_id, selectedType]);

  const handleApprove = async () => {
    if (!leaveRecord || !selectedType) return;
    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('leave_records')
        .update({
          status: 'approved',
          leave_type_id: selectedType.id,
          leave_type: (selectedType.is_paid ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
          deduction_days: deductionDays,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', leaveRecord.id);

      if (error) throw error;

      const dateStr = format(new Date(leaveRecord.leave_date), 'dd MMM yyyy');
      if (leaveRecord.staff?.user_id) {
        NotificationEvents.leaveApproved(
          leaveRecord.staff.user_id,
          leaveRecord.staff.full_name || 'Staff',
          dateStr,
          deductionDays,
        );
      }

      toast({ title: 'Leave Approved', description: `Leave record for ${dateStr} has been approved.` });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error approving leave:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to approve leave.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!leaveRecord) return;
    if (!rejectionReason.trim()) {
      toast({ title: 'Validation Error', description: 'Please provide a rejection reason.', variant: 'destructive' });
      return;
    }
    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('leave_records')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', leaveRecord.id);

      if (error) throw error;

      if (leaveRecord.staff?.user_id) {
        const dateStr = format(new Date(leaveRecord.leave_date), 'dd MMM yyyy');
        NotificationEvents.leaveRejected(
          leaveRecord.staff.user_id,
          leaveRecord.staff.full_name || 'Staff',
          dateStr,
          rejectionReason,
        );
      }

      toast({ title: 'Leave Rejected', description: 'Leave request has been rejected.' });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error rejecting leave:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to reject leave.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!leaveRecord) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review Leave Request</DialogTitle>
          <DialogDescription>Pick the leave type — it decides the salary effect shown below.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{leaveRecord.staff?.full_name}</span>
              <Badge variant="outline" className="ml-auto">{leaveRecord.staff?.employee_id}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(leaveRecord.leave_date), 'EEEE, dd MMMM yyyy')}</span>
            </div>
            {leaveRecord.remarks && (
              <div className="text-sm text-muted-foreground pt-2 border-t">
                <strong>Remarks:</strong> {leaveRecord.remarks}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Leave Type</Label>
            <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex w-full items-center justify-between gap-3">
                      <span>{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.default_deduction === 0
                          ? 'no deduction'
                          : `${t.default_deduction}d deducted`}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Salary effect — derived from the type, not a second opinion. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-muted-foreground">Salary effect</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={overrideDeduction}
                  onChange={(e) => setOverrideDeduction(e.target.checked)}
                />
                Adjust
              </label>
            </div>

            {!overrideDeduction ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {deductionDays === 0
                  ? 'No salary deduction — this leave is paid.'
                  : `${deductionDays} day${deductionDays === 1 ? '' : 's'} will be deducted from salary.`}
              </p>
            ) : (
              <>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  step="0.5"
                  value={deductionDays}
                  onChange={(e) => setDeductionDays(toAmount(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Use 0.5 for a half day. Clear the tick to go back to the type’s own rule
                  ({selectedType ? `${selectedType.default_deduction}d` : '—'}).
                </p>
              </>
            )}

            {/* The two things that make an override legitimate — or a mistake. */}
            {selectedType && deductionDays !== selectedType.default_deduction && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {selectedType.name} normally deducts {selectedType.default_deduction}d.
                You are approving it with {deductionDays}d.
              </p>
            )}
            {balance !== null && (
              <p className={`text-xs ${balance <= 0 ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}`}>
                {balance <= 0
                  ? `No ${selectedType?.name} balance left (${balance}d) — approving this as paid gives a day they have not earned.`
                  : `${balance}d of ${selectedType?.name} remaining after previous approvals.`}
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Rejection Reason (if rejecting)</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Required if rejecting..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="destructive" onClick={handleReject} disabled={isSubmitting} className="w-full sm:w-auto">
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </Button>
          <Button onClick={handleApprove} disabled={isSubmitting} className="w-full sm:w-auto">
            <CheckCircle className="mr-2 h-4 w-4" />
            {deductionDays === 0 ? 'Approve (no deduction)' : `Approve (${deductionDays}d deduction)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
