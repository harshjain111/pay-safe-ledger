import { useState } from 'react';
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
  onSaved: () => void;
}

export function StaffStatusDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
  nextStatus,
  onSaved,
}: Props) {
  const isSeparation = nextStatus === 'left' || nextStatus === 'terminated';
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { status: nextStatus };
      if (isSeparation) {
        payload.date_of_leaving = date;
        payload.separation_reason = reason || null;
      }
      const { error } = await supabase
        .from('staff')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(payload as any)
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
              ? `Record the separation details for ${staffName}. All historical records are preserved.`
              : `${staffName} will be moved to ${STAFF_STATUS_LABEL[nextStatus]}.`}
          </DialogDescription>
        </DialogHeader>

        {isSeparation && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dol">
                Date of {nextStatus === 'left' ? 'Leaving' : 'Termination'} *
              </Label>
              <Input
                id="dol"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
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
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || (isSeparation && !date)}>
            {saving ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
