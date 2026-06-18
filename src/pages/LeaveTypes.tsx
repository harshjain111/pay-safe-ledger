import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, ShieldAlert, CalendarRange } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/layout/filter-bar';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { toAmount } from '@/lib/utils';
import { validateLeaveTypeForm, type Period } from '@/lib/leave-allocation';
import {
  listLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  type LeaveType, type LeaveTypeInput,
} from '@/lib/leave-service';

const EMPTY: LeaveTypeInput = {
  name: '', code: '', description: '',
  no_of_auto_allocation_leaves: 0, auto_allocation_period: 'MONTH',
  carry_forward_leaves: 0, carry_forward_period: 'MONTH',
  encashment_enabled: false, encashment_limit: null, encashment_period: null,
};

function LeaveTypeDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: LeaveType | null; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<LeaveTypeInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? {
      name: editing.name, code: editing.code, description: editing.description ?? '',
      no_of_auto_allocation_leaves: editing.no_of_auto_allocation_leaves,
      auto_allocation_period: editing.auto_allocation_period,
      carry_forward_leaves: editing.carry_forward_leaves,
      carry_forward_period: editing.carry_forward_period,
      encashment_enabled: editing.encashment_enabled,
      encashment_limit: editing.encashment_limit,
      encashment_period: editing.encashment_period,
    } : EMPTY);
  }, [open, editing]);

  const set = <K extends keyof LeaveTypeInput>(k: K, v: LeaveTypeInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const err = validateLeaveTypeForm(form);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const payload: LeaveTypeInput = {
        ...form,
        description: form.description?.trim() || null,
        encashment_limit: form.encashment_enabled ? toAmount(form.encashment_limit) : null,
        encashment_period: form.encashment_enabled ? form.encashment_period : null,
      };
      if (editing) await updateLeaveType(editing.id, payload);
      else await createLeaveType(payload, user?.id ?? null);
      toast.success(editing ? 'Leave type updated' : 'Leave type created');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Leave Type' : 'Create Leave Type'}</DialogTitle>
          <DialogDescription>Auto-allocation, carry-forward cap and optional encashment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Leave Name *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Regular" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Alias *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="L1" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Optional" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">No. of Auto Allocation Leaves *</Label><Input type="number" min="0" step="0.5" value={form.no_of_auto_allocation_leaves} onChange={(e) => set('no_of_auto_allocation_leaves', toAmount(e.target.value))} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Auto-allocation period *</Label>
              <Select value={form.auto_allocation_period} onValueChange={(v) => set('auto_allocation_period', v as Period)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover"><SelectItem value="MONTH">Every month</SelectItem><SelectItem value="YEAR">Every year</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Carry Forward (max) *</Label><Input type="number" min="0" step="0.5" value={form.carry_forward_leaves} onChange={(e) => set('carry_forward_leaves', toAmount(e.target.value))} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Carry-forward period *</Label>
              <Select value={form.carry_forward_period} onValueChange={(v) => set('carry_forward_period', v as Period)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover"><SelectItem value="MONTH">End of every month</SelectItem><SelectItem value="YEAR">End of every year</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="text-sm" htmlFor="encash">Encashment of Leave</Label>
            <Switch id="encash" checked={form.encashment_enabled} onCheckedChange={(v) => set('encashment_enabled', v)} />
          </div>

          {form.encashment_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Encashment Limit *</Label><Input type="number" min="0" step="0.5" value={form.encashment_limit ?? ''} onChange={(e) => set('encashment_limit', toAmount(e.target.value))} /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Encashment period *</Label>
                <Select value={form.encashment_period ?? ''} onValueChange={(v) => set('encashment_period', v as Period)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-popover"><SelectItem value="MONTH">Monthly</SelectItem><SelectItem value="YEAR">Yearly</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeaveTypes() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [rows, setRows] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);

  const reload = () => {
    setLoading(true);
    listLeaveTypes().then(setRows).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false));
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const remove = async (r: LeaveType) => {
    try { await deleteLeaveType(r.id); toast.success('Leave type disabled'); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can manage leave types." />;

  const periodLabel = (n: number, p: Period) => `${n}/${p === 'MONTH' ? 'mo' : 'yr'}`;
  const columns: DataTableColumn<LeaveType>[] = [
    { id: 'name', header: 'Leave Name', sortable: true, sortAccessor: (r) => r.name, cellClassName: 'font-medium', cell: (r) => r.name },
    { id: 'alias', header: 'Alias', cell: (r) => <Badge variant="secondary" className="text-[11px]">{r.code}</Badge> },
    { id: 'auto', header: 'Auto Allocation', cell: (r) => periodLabel(r.no_of_auto_allocation_leaves, r.auto_allocation_period) },
    { id: 'carry', header: 'Carry Forward', cell: (r) => periodLabel(r.carry_forward_leaves, r.carry_forward_period) },
    { id: 'encash', header: 'Encashment', cell: (r) => r.encashment_enabled ? `> ${r.encashment_limit}` : '—' },
    { id: 'created', header: 'Created On', sortable: true, sortAccessor: (r) => new Date(r.created_at), cell: (r) => format(new Date(r.created_at), 'dd MMM yyyy') },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Leave Types" description="Master of leave types — allocation, carry-forward and encashment.">
        <Button onClick={() => { setEditing(null); setDialog(true); }} className="gap-1.5"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New leave type</span></Button>
      </PageHeader>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search name or alias…" />

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        isLoading={loading}
        initialSort={{ columnId: 'name', direction: 'asc' }}
        rowActions={(r) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => { setEditing(r); setDialog(true); }}><Pencil className="h-4 w-4" /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Disable {r.name}?</AlertDialogTitle><AlertDialogDescription>It will be hidden from new assignments. Types with existing balances can't be deleted.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(r)}>Disable</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        actionsHeader="Actions"
        emptyState={<EmptyState icon={CalendarRange} title="No leave types" description="Create your first leave type to start assigning and tracking balances." />}
      />

      <LeaveTypeDialog open={dialog} onOpenChange={setDialog} editing={editing} onSaved={reload} />
    </div>
  );
}
