import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type StaffStatus = 'active' | 'inactive' | 'left' | 'terminated';

export const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  left: 'Left',
  terminated: 'Terminated',
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staffId: string;
  staffName: string;
  nextStatus: StaffStatus;
  /** Needed to validate the leaving date; pass when available. */
  dateOfJoining?: string | null;
  onSaved: () => void;
}

/**
 * PHASE 7 — status changes drive the FINAL SALARY: settlement-engine.ts uses
 * date_of_leaving to pro-rate the last month, so a wrong date means a wrong
 * final pay. Leaving inactive/left/terminated therefore REQUIRES an explicit,
 * back-datable Date of Leaving (never before joining, never in the future)
 * and a mandatory separation reason — both written WITH the status change so
 * staff_sync_status() never has to fall back to CURRENT_DATE. Reactivating
 * clears both (with a confirmation).
 */
export function StaffStatusDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
  nextStatus,
  dateOfJoining,
  onSaved,
}: Props) {
  const isSeparation = nextStatus === 'inactive' || nextStatus === 'left' || nextStatus === 'terminated';
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [monthFinalized, setMonthFinalized] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(new Date().toISOString().slice(0, 10));
    setReason('');
  }, [open]);

  // Warn when the chosen leaving date falls inside an already-finalized month.
  useEffect(() => {
    if (!open || !isSeparation || !date) { setMonthFinalized(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('salary_sheet_locks' as never)
        .select('month')
        .eq('month', date.slice(0, 7))
        .maybeSingle();
      if (!cancelled) setMonthFinalized(!error && !!data);
    })();
    return () => { cancelled = true; };
  }, [open, isSeparation, date]);

  const today = new Date().toISOString().slice(0, 10);
  const dateTooEarly = !!(dateOfJoining && date && date < dateOfJoining);
  const dateInFuture = !!date && date > today;
  const dateInvalid = !date || dateTooEarly || dateInFuture;

  const handleSave = async () => {
    if (isSeparation && dateInvalid) return;
    if (isSeparation && !reason.trim()) {
      toast({ title: 'Reason required', description: 'A separation reason is mandatory.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { status: nextStatus };
      if (isSeparation) {
        // Written WITH the status change — staff_sync_status() only defaults
        // date_of_leaving when NULL, so the user's date is never overwritten.
        payload.date_of_leaving = date;
        payload.separation_reason = reason.trim();
      }
      const { error } = await supabase
        .from('staff')
        .update(payload as never)
        .eq('id', staffId);
      if (error) throw error;
      toast({
        title: 'Status updated',
        description: `${staffName} marked as ${STAFF_STATUS_LABEL[nextStatus]}.`,
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const err = e as { message?: string };
      toast({
        title: 'Error',
        description: err.message || 'Failed to update status.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as {STAFF_STATUS_LABEL[nextStatus]}</DialogTitle>
          <DialogDescription>
            {isSeparation
              ? `Record the separation details for ${staffName}. The leaving date drives their final month's salary; all historical records are preserved.`
              : `${staffName} will be reactivated. Their date of leaving and separation reason will be cleared.`}
          </DialogDescription>
        </DialogHeader>

        {isSeparation && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dol">Date of Leaving *</Label>
              <Input
                id="dol"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={dateOfJoining ?? undefined}
                max={today}
              />
              <p className="text-xs text-muted-foreground">
                Back-date this to the day they actually stopped working — recording it late must not change their
                final salary.
              </p>
              {dateTooEarly && (
                <p className="text-xs font-medium text-destructive">
                  The leaving date cannot be before their joining date ({dateOfJoining ? format(parseISO(dateOfJoining), 'dd MMM yyyy') : ''}).
                </p>
              )}
              {dateInFuture && <p className="text-xs font-medium text-destructive">The leaving date cannot be in the future.</p>}
              {monthFinalized && (
                <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-xs font-medium text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This month is finalized. Their final salary was calculated using a different leaving date.
                    De-finalize and re-run to correct it.
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Separation Reason *</Label>
              <Textarea
                id="reason"
                placeholder="e.g. Resigned for new opportunity / Misconduct / Performance"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Go Back
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || (isSeparation && (dateInvalid || !reason.trim()))}
          >
            {saving ? 'Saving...' : isSeparation ? 'Confirm separation' : 'Reactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
