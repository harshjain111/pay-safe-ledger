import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { raiseLoginResetRequest } from '@/lib/login-reset';
import { KeyRound, Loader2 } from 'lucide-react';

interface StaffOption { id: string; full_name: string; employee_id: string }

interface RaiseLoginResetDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When set, the request targets this staff member (no picker) — staff self-service. */
  fixedStaff?: { id: string; full_name: string };
  onCreated?: () => void;
}

export function RaiseLoginResetDialog({ open, onOpenChange, fixedStaff, onCreated }: RaiseLoginResetDialogProps) {
  const { user } = useAuth();
  const [staffId, setStaffId] = useState('');
  const [reason, setReason] = useState('');
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStaffId(fixedStaff?.id ?? '');
    setReason('');
    if (!fixedStaff) {
      // Only staff who actually have an app login can have one reset.
      supabase
        .from('staff')
        .select('id, full_name, employee_id')
        .eq('is_active', true)
        .not('user_id', 'is', null)
        .order('full_name')
        .then(({ data }) => setStaff((data ?? []) as StaffOption[]));
    }
  }, [open, fixedStaff]);

  const submit = async () => {
    const targetId = fixedStaff?.id ?? staffId;
    if (!targetId) { toast.error('Select the staff account'); return; }
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setSaving(true);
    try {
      await raiseLoginResetRequest({ staffId: targetId, reason, requestedBy: user?.id ?? null });
      toast.success('Login-reset request raised');
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to raise request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Login Reset Request
          </DialogTitle>
          <DialogDescription>
            {fixedStaff
              ? 'Request a reset of your app login. An owner reviews and approves it in Approvals.'
              : 'Raise a login-reset request on behalf of a staff member. An owner reviews and approves it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {fixedStaff ? (
            <div className="rounded-lg border bg-muted/30 p-2.5 text-sm">
              Account: <span className="font-medium">{fixedStaff.full_name}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Staff account</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</SelectItem>)}
                </SelectContent>
              </Select>
              {staff.length === 0 && <p className="text-[11px] text-muted-foreground">No active staff with an app login found.</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="lr-reason" className="text-xs">Reason</Label>
            <Textarea id="lr-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Forgot password / locked out" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : 'Raise request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
