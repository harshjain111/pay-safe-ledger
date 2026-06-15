import { useEffect, useMemo, useState } from 'react';
import { format, subMonths, addMonths } from 'date-fns';
import { Plus, Loader2, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Amount } from '@/components/ui/amount';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterBar } from '@/components/layout/filter-bar';
import { StatusTabs } from '@/components/ui/status-tabs';
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
import { cn, toAmount } from '@/lib/utils';

interface ArrearRow {
  id: string;
  staff_id: string;
  amount: number;
  reason: string;
  period_label: string | null;
  settlement_month: string;
  status: string;
  staffName: string;
  employeeId: string;
}
interface StaffOption { id: string; full_name: string; employee_id: string }

const MONTH_OPTIONS = Array.from({ length: 6 }, (_, i) => format(addMonths(subMonths(new Date(), 3), i), 'yyyy-MM'));

function AddArrearDialog({ open, onOpenChange, staff, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; staff: StaffOption[]; onSaved: () => void }) {
  const { user } = useAuth();
  const [staffId, setStaffId] = useState('');
  const [kind, setKind] = useState<'back_pay' | 'recovery'>('back_pay');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [period, setPeriod] = useState('');
  const [settlementMonth, setSettlementMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStaffId(''); setKind('back_pay'); setAmount(''); setReason(''); setPeriod('');
    setSettlementMonth(format(subMonths(new Date(), 1), 'yyyy-MM'));
  }, [open]);

  const submit = async () => {
    const amt = toAmount(amount);
    if (!staffId) { toast.error('Pick a staff member'); return; }
    if (!amt || amt <= 0) { toast.error('Enter a positive amount'); return; }
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('salary_arrears').insert({
        staff_id: staffId,
        amount: kind === 'recovery' ? -amt : amt,
        reason: reason.trim(),
        period_label: period.trim() || null,
        settlement_month: settlementMonth,
        status: 'pending',
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success('Arrear added');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add arrear');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Arrear</DialogTitle>
          <DialogDescription>A back-pay (added) or recovery (deducted) picked up in the chosen settlement month.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Staff</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent className="bg-popover">{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'back_pay' | 'recovery')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="back_pay">Back-pay (+)</SelectItem>
                  <SelectItem value="recovery">Recovery (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Amount (₹)</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Relates to period</Label><Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Apr 2026" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pay in settlement</Label>
              <Select value={settlementMonth} onValueChange={setSettlementMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">{MONTH_OPTIONS.map((m) => <SelectItem key={m} value={m}>{format(new Date(m + '-01'), 'MMM yyyy')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Revised increment backdated" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Add arrear'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Arrears() {
  const { can } = useAuth();
  const canManage = can('settings.payroll.edit');

  const [rows, setRows] = useState<ArrearRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(false);

  const reload = async () => {
    setLoading(true);
    const { data: arr } = await supabase
      .from('salary_arrears')
      .select('id, staff_id, amount, reason, period_label, settlement_month, status')
      .order('created_at', { ascending: false });
    const list = (arr ?? []) as Omit<ArrearRow, 'staffName' | 'employeeId'>[];
    const ids = [...new Set(list.map((r) => r.staff_id))];
    const nameById = new Map<string, { full_name: string; employee_id: string }>();
    if (ids.length) {
      const { data: st } = await supabase.from('staff').select('id, full_name, employee_id').in('id', ids);
      for (const s of (st ?? []) as StaffOption[]) nameById.set(s.id, { full_name: s.full_name, employee_id: s.employee_id });
    }
    setRows(list.map((r) => ({ ...r, staffName: nameById.get(r.staff_id)?.full_name ?? 'Staff', employeeId: nameById.get(r.staff_id)?.employee_id ?? '' })));
    setLoading(false);
  };

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    reload();
    supabase.from('staff').select('id, full_name, employee_id').eq('is_active', true).order('full_name').then(({ data }) => setStaff((data ?? []) as StaffOption[]));
  }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (q && !r.staffName.toLowerCase().includes(q) && !r.reason.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  const cancel = async (r: ArrearRow) => {
    const { error } = await supabase.from('salary_arrears').update({ status: 'cancelled' }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Arrear cancelled'); reload();
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="You need the “Edit payroll & statutory settings” permission." />;

  const columns: DataTableColumn<ArrearRow>[] = [
    { id: 'staff', header: 'Staff', sortable: true, sortAccessor: (r) => r.staffName, cell: (r) => <div><div className="font-medium">{r.staffName}</div><div className="text-[11px] text-muted-foreground">{r.employeeId}</div></div> },
    { id: 'period', header: 'Period', cell: (r) => r.period_label || '—' },
    { id: 'amount', header: 'Amount', align: 'right', sortable: true, sortAccessor: (r) => r.amount, cell: (r) => (
      <span className={cn('font-medium', r.amount < 0 ? 'text-destructive' : 'text-success')}>{r.amount < 0 ? '−' : '+'}<Amount value={Math.abs(r.amount)} size="sm" /></span>
    ) },
    { id: 'reason', header: 'Reason', cellClassName: 'max-w-[240px]', cell: (r) => <span className="block truncate" title={r.reason}>{r.reason}</span> },
    { id: 'month', header: 'Pay in', sortable: true, sortAccessor: (r) => r.settlement_month, cell: (r) => format(new Date(r.settlement_month + '-01'), 'MMM yyyy') },
    { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Arrears" description="Back-pay and recoveries picked up in a chosen settlement month.">
        <Button onClick={() => setDialog(true)} className="gap-1.5"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add arrear</span></Button>
      </PageHeader>

      <StatusTabs value={tab} onValueChange={setTab} tabs={[{ value: 'pending', label: 'Pending' }, { value: 'settled', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff or reason…" />

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        isLoading={loading}
        initialSort={{ columnId: 'month', direction: 'desc' }}
        rowActions={(r) => (r.status === 'pending' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Cancel"><X className="h-4 w-4" /></Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Cancel this arrear?</AlertDialogTitle><AlertDialogDescription>It won’t be picked up in any settlement.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={() => cancel(r)}>Cancel arrear</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : <span className="text-xs text-muted-foreground">—</span>)}
        actionsHeader=""
        emptyState={<EmptyState icon={loading ? Loader2 : Plus} title="No arrears" description="Add a back-pay or recovery to include it in a settlement." />}
      />

      <AddArrearDialog open={dialog} onOpenChange={setDialog} staff={staff} onSaved={reload} />
    </div>
  );
}
