import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fetchLeaveTypes, type LeaveTypeRow } from '@/lib/leave';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staff: { id: string; name: string } | null;
  date: string | null;            // yyyy-MM-dd
  disciplineLogId?: string | null; // the absent row to cancel, if any
  onSuccess: () => void;
}

/** Convert an absent day into an approved, typed leave. Creates the leave_record
 *  and cancels the matching absent discipline entry so it isn't double-counted. */
export function AssignLeaveTypeDialog({ open, onOpenChange, staff, date, disciplineLogId, onSuccess }: Props) {
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveTypeRow[]>([]);
  const [typeId, setTypeId] = useState('');
  const [deduction, setDeduction] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const t = await fetchLeaveTypes(true);
      setTypes(t);
      const def = t.find((x) => x.is_default) ?? t[0];
      if (def) { setTypeId(def.id); setDeduction(def.default_deduction); }
    })();
  }, [open]);

  const selected = types.find((t) => t.id === typeId) ?? null;
  useEffect(() => { if (selected) setDeduction(selected.default_deduction); }, [typeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const assign = async () => {
    if (!staff || !date || !selected) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('leave_records').insert([{
        staff_id: staff.id,
        leave_date: date,
        leave_type_id: selected.id,
        leave_type: (selected.is_paid ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
        deduction_days: deduction,
        status: 'approved' as const,
        remarks: 'Absence converted to leave',
        created_by: user?.id,
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      }]);
      if (error) {
        if (error.code === '23505') throw new Error('A leave already exists for this date.');
        throw error;
      }
      // Cancel the absent discipline entry so it isn't fined / counted absent.
      if (disciplineLogId) {
        await supabase
          .from('attendance_discipline_log' as never)
          .update({
            is_cancelled: true,
            cancelled_by: user?.id ?? null,
            cancelled_at: new Date().toISOString(),
            cancellation_reason: `Assigned as ${selected.name} leave`,
          } as never)
          .eq('id', disciplineLogId);
      }
      toast({ title: 'Leave assigned', description: `${selected.name} on ${format(new Date(date), 'dd MMM yyyy')}` });
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not assign', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign leave type</DialogTitle>
          <DialogDescription>
            {staff?.name}{date ? ` · ${format(new Date(date), 'EEEE, dd MMM yyyy')}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Leave type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="text-xs text-muted-foreground">· {t.is_paid ? 'Paid' : 'Unpaid'}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deduction days</Label>
            <Input type="number" min="0" max="2" step="0.5" value={deduction} onChange={(e) => setDeduction(Number(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground">Paid leave is usually 0; unpaid absence usually 1.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={assign} disabled={saving || !typeId}>{saving ? 'Assigning…' : 'Assign leave'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
