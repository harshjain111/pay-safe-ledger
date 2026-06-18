import { useEffect, useState } from 'react';
import { CalendarDays, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { fetchLeaveTypes, type LeaveTypeRow, type LeaveAccrualMode } from '@/lib/leave';

const ACCRUAL_LABEL: Record<LeaveAccrualMode, string> = {
  annual: 'Annual (granted upfront)',
  monthly: 'Monthly (accrues over the year)',
  none: 'No accrual',
};

interface FormState {
  name: string;
  code: string;
  is_paid: boolean;
  accrual: LeaveAccrualMode;
  default_quota: number;
  default_deduction: number;
  carry_forward: boolean;
  max_balance: string; // '' = none
  is_active: boolean;
}

const blankForm: FormState = {
  name: '', code: '', is_paid: true, accrual: 'annual',
  default_quota: 12, default_deduction: 0, carry_forward: false, max_balance: '', is_active: true,
};

function LeaveTypeDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: LeaveTypeRow | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [f, setF] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(
      editing
        ? {
            name: editing.name, code: editing.code, is_paid: editing.is_paid, accrual: editing.accrual,
            default_quota: editing.default_quota, default_deduction: editing.default_deduction,
            carry_forward: editing.carry_forward, max_balance: editing.max_balance == null ? '' : String(editing.max_balance),
            is_active: editing.is_active,
          }
        : blankForm,
    );
  }, [open, editing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  // Toggling paid pre-fills the typical per-day deduction.
  const setPaid = (paid: boolean) => setF((p) => ({ ...p, is_paid: paid, default_deduction: paid ? 0 : 1 }));

  const submit = async () => {
    if (!f.name.trim()) { toast.error('Name is required'); return; }
    if (!f.code.trim()) { toast.error('Code is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(),
        code: f.code.trim().toUpperCase(),
        is_paid: f.is_paid,
        accrual: f.accrual,
        default_quota: f.accrual === 'none' ? 0 : Number(f.default_quota) || 0,
        default_deduction: Number(f.default_deduction) || 0,
        carry_forward: f.carry_forward,
        max_balance: f.max_balance.trim() === '' ? null : Number(f.max_balance),
        is_active: f.is_active,
      };
      if (editing) {
        const { error } = await supabase.from('leave_types').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('leave_types').insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
      toast.success(editing ? 'Leave type updated' : 'Leave type created');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      toast.error(/duplicate|unique/i.test(msg) ? 'That code is already used' : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Leave Type' : 'Add Leave Type'}</DialogTitle>
          <DialogDescription>Paid types don’t dock salary; unpaid types deduct per day per the existing rules.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sick Leave" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Code</Label>
              <Input value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="SL" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-3">
              <Label className="text-sm">Paid leave</Label>
              <p className="text-[10px] text-muted-foreground">No salary deduction when used</p>
            </div>
            <Switch checked={f.is_paid} onCheckedChange={setPaid} aria-label="Paid leave" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Accrual</Label>
              <Select value={f.accrual} onValueChange={(v) => set('accrual', v as LeaveAccrualMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="none">No accrual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default quota (days/yr)</Label>
              <Input type="number" min="0" step="0.5" value={f.default_quota} disabled={f.accrual === 'none'} onChange={(e) => set('default_quota', Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Deduction / day</Label>
              <Input type="number" min="0" step="0.5" value={f.default_deduction} onChange={(e) => set('default_deduction', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max balance (optional)</Label>
              <Input type="number" min="0" step="0.5" value={f.max_balance} onChange={(e) => set('max_balance', e.target.value)} placeholder="—" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-3">
              <Label className="text-sm">Carry forward</Label>
              <p className="text-[10px] text-muted-foreground">Unused balance carries into next year</p>
            </div>
            <Switch checked={f.carry_forward} onCheckedChange={(v) => set('carry_forward', v)} aria-label="Carry forward" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-3">
              <Label className="text-sm">Active</Label>
              <p className="text-[10px] text-muted-foreground">Available when recording leave</p>
            </div>
            <Switch checked={f.is_active} onCheckedChange={(v) => set('is_active', v)} aria-label="Active" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add type'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveTypesCard() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const [types, setTypes] = useState<LeaveTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveTypeRow | null>(null);

  const reload = async () => {
    setLoading(true);
    setTypes(await fetchLeaveTypes());
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const handleDelete = async (t: LeaveTypeRow) => {
    const { error } = await supabase.from('leave_types').delete().eq('id', t.id);
    if (error) {
      // Referenced by existing leave records — deactivate instead.
      await supabase.from('leave_types').update({ is_active: false }).eq('id', t.id);
      toast.success('Type is in use — deactivated instead of deleted');
    } else {
      toast.success('Leave type deleted');
    }
    reload();
  };

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Leave Types
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Define leave types with their own quota and accrual. Paid-leave balances use the default type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave types yet.</p>
        ) : (
          types.map((t) => (
            <div key={t.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${t.is_active ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant="outline" className="text-[10px]">{t.code}</Badge>
                  <Badge variant="outline" className={t.is_paid ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 text-amber-700 dark:text-amber-400'}>
                    {t.is_paid ? 'Paid' : 'Unpaid'}
                  </Badge>
                  {t.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                  {!t.is_active && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {ACCRUAL_LABEL[t.accrual]}
                  {t.accrual !== 'none' && ` · ${t.default_quota} days/yr`}
                  {` · ${t.default_deduction}d deduction`}
                  {t.carry_forward && ' · carries forward'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => { setEditing(t); setDialogOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{t.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>If the type is used by existing leave records it will be deactivated instead of deleted (so history is preserved).</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(t)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Add leave type
        </Button>
      </CardContent>
      <LeaveTypeDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={reload} />
    </Card>
  );
}
