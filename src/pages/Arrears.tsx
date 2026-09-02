import { useEffect, useState } from 'react';
import { format, subMonths } from 'date-fns';
import { Ban, CheckCircle2, Inbox, Plus, ShieldX, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toAmount } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PageHeader, ActionsMenu, DataTable, Drawer, RowMenu, EmptyState, InlineNote,
  type DataTableColumn,
} from '@/components/patterns';
import { toast } from '@/lib/toast';
import { createArrearsEntry } from '@/lib/journal-entries';
import type { Staff } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 6 — /settlements/arrears. Grouped per employee; Pay / Write Off /
// Cancel row verbs. WRITE OFF is new: salary clears ~the 10th of the next
// month, so an abrupt leaver's worked days are a liability the company will
// not actually pay — it must close VISIBLY (mandatory reason + reversing
// journal so Trial Balance still reconciles), not vanish.
// ---------------------------------------------------------------------------

interface ArrearLine {
  id: string;
  staff_id: string;
  amount: number;
  reason: string;
  settlement_month: string;
  status: string;
  created_at: string;
}

interface ArrearRow {
  staff: Staff;
  lines: ArrearLine[];
  created: number;   // total positive (back-pay) created
  paid: number;      // settled total
  outstanding: number; // pending total (signed)
  hasPending: boolean;
}

const MONTH_OPTIONS = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 2 - i), 'yyyy-MM'));

export default function Arrears() {
  const { user, can } = useAuth();
  const canManage = can('settlements.run') || can('settings.payroll.edit');

  const [rows, setRows] = useState<ArrearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'settled' | 'written_off' | 'all'>('pending');
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addStaffId, setAddStaffId] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDate, setAddDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [addMonth, setAddMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [addComment, setAddComment] = useState('');

  const [payRow, setPayRow] = useState<ArrearRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payComment, setPayComment] = useState('');

  const [writeOffRow, setWriteOffRow] = useState<ArrearRow | null>(null);
  const [writeOffReason, setWriteOffReason] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const [arrRes, staffRes] = await Promise.all([
        supabase.from('salary_arrears').select('id, staff_id, amount, reason, settlement_month, status, created_at').order('created_at', { ascending: false }),
        supabase.from('staff').select('*').order('full_name'),
      ]);
      if (arrRes.error) throw arrRes.error;
      const staffMap = new Map<string, Staff>();
      for (const s of (staffRes.data ?? []) as Staff[]) staffMap.set(s.id, s);
      setAllStaff(((staffRes.data ?? []) as Staff[]).filter((s) => s.is_active));

      const byStaff = new Map<string, ArrearLine[]>();
      for (const a of (arrRes.data ?? []) as unknown as ArrearLine[]) {
        const list = byStaff.get(a.staff_id) ?? [];
        list.push(a);
        byStaff.set(a.staff_id, list);
      }
      const built: ArrearRow[] = [];
      for (const [staffId, lines] of byStaff) {
        const staff = staffMap.get(staffId);
        if (!staff) continue;
        const scoped = statusFilter === 'all' ? lines : lines.filter((l) => l.status === statusFilter);
        if (scoped.length === 0) continue;
        built.push({
          staff,
          lines: scoped,
          created: lines.filter((l) => toAmount(l.amount) > 0).reduce((s, l) => s + toAmount(l.amount), 0),
          paid: lines.filter((l) => l.status === 'settled').reduce((s, l) => s + toAmount(l.amount), 0),
          outstanding: lines.filter((l) => l.status === 'pending').reduce((s, l) => s + toAmount(l.amount), 0),
          hasPending: lines.some((l) => l.status === 'pending'),
        });
      }
      built.sort((a, b) => Math.abs(b.outstanding) - Math.abs(a.outstanding));
      setRows(built);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load arrears');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) reload();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter change
  }, [canManage, statusFilter]);

  if (!canManage) {
    return <EmptyState icon={ShieldX} title="Access denied" instruction="Arrears need the settlements permission — ask an owner." />;
  }

  const saveAdd = async () => {
    const amount = Number(addAmount);
    if (!addStaffId) { toast.error('Pick an employee'); return; }
    if (!amount || Number.isNaN(amount)) { toast.error('Enter a non-zero amount (negative = recovery)'); return; }
    if (!addComment.trim()) { toast.error('A comment is required'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('salary_arrears').insert({
        staff_id: addStaffId,
        amount,
        reason: addComment.trim(),
        settlement_month: addMonth,
        status: 'pending',
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
      toast.success('Arrears added — it folds into that month\'s payroll.');
      setAddOpen(false);
      setAddStaffId(''); setAddAmount(''); setAddComment('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add arrears');
    } finally {
      setBusy(false);
    }
  };

  const savePay = async () => {
    if (!payRow || !user?.id) return;
    const amount = toAmount(payAmount);
    const pendingLines = payRow.lines.filter((l) => l.status === 'pending');
    const outstanding = pendingLines.reduce((s, l) => s + toAmount(l.amount), 0);
    if (!amount || amount <= 0) { toast.error('Enter the arrears amount to pay'); return; }
    if (Math.abs(amount - outstanding) > 0.01) {
      toast.error('Partial arrears payment is not supported — pay the full outstanding, or adjust with a recovery line first.');
      return;
    }
    setBusy(true);
    try {
      // Post the balanced journal, mark the pending lines settled, and queue a
      // payout request so the money movement runs through Advance Payouts.
      await createArrearsEntry({
        staffId: payRow.staff.id,
        staffName: payRow.staff.full_name,
        amount: outstanding,
        settlementMonth: format(new Date(), 'MMMM yyyy'),
        createdBy: user.id,
      });
      const { error } = await supabase
        .from('salary_arrears')
        .update({ status: 'settled', settled_at: new Date().toISOString() } as never)
        .in('id', pendingLines.map((l) => l.id));
      if (error) throw error;
      if (outstanding > 0) {
        await supabase.from('payment_requests').insert({
          staff_id: payRow.staff.id,
          requested_by: user.id,
          amount: outstanding,
          reason: `Arrears payout${payComment.trim() ? ` — ${payComment.trim()}` : ''}`,
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          payout_type: 'salary',
        } as never);
      }
      toast.success('Arrears paid — execute the payout from Advance Payouts.');
      setPayRow(null); setPayAmount(''); setPayComment('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not pay arrears');
    } finally {
      setBusy(false);
    }
  };

  const saveWriteOff = async () => {
    if (!writeOffRow || !user?.id) return;
    if (!writeOffReason.trim()) { toast.error('A reason is mandatory for a write-off'); return; }
    const pendingLines = writeOffRow.lines.filter((l) => l.status === 'pending');
    const outstanding = pendingLines.reduce((s, l) => s + toAmount(l.amount), 0);
    if (pendingLines.length === 0) { toast.error('Nothing pending to write off'); return; }
    setBusy(true);
    try {
      // The REVERSING journal keeps the ledger balanced (write-off of a
      // positive liability posts the negative of the outstanding).
      if (Math.abs(outstanding) >= 0.01) {
        await createArrearsEntry({
          staffId: writeOffRow.staff.id,
          staffName: writeOffRow.staff.full_name,
          amount: -outstanding,
          settlementMonth: `write-off ${format(new Date(), 'MMM yyyy')}`,
          createdBy: user.id,
        });
      }
      const { error } = await supabase
        .from('salary_arrears')
        .update({
          status: 'written_off',
          written_off_at: new Date().toISOString(),
          written_off_by: user.id,
          written_off_reason: writeOffReason.trim(),
        } as never)
        .in('id', pendingLines.map((l) => l.id));
      if (error) throw error;
      toast.success(`Wrote off ₹${Math.abs(outstanding).toLocaleString('en-IN')} for ${writeOffRow.staff.full_name}. The reversing entry keeps the books balanced.`);
      setWriteOffRow(null); setWriteOffReason('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not write off');
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async (row: ArrearRow) => {
    const pendingIds = row.lines.filter((l) => l.status === 'pending').map((l) => l.id);
    if (pendingIds.length === 0) return;
    const { error } = await supabase.from('salary_arrears').update({ status: 'cancelled' } as never).in('id', pendingIds);
    if (error) { toast.error(error.message); return; }
    toast.success('Pending arrears cancelled.');
    reload();
  };

  const columns: DataTableColumn<ArrearRow>[] = [
    { key: 'emp', header: 'Employee', width: 220, render: (r) => (
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{r.staff.full_name}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{r.staff.employee_id}</p>
        </div>
        {!r.staff.is_active && <Badge variant="destructive" className="shrink-0 text-[10px]">Terminated</Badge>}
      </div>
    ) },
    { key: 'created', header: 'Arrears Created', align: 'right', render: (r) => r.created.toLocaleString('en-IN') },
    { key: 'paid', header: 'Arrears Paid', align: 'right', cellTone: (r) => (r.paid > 0 ? 'positive' : undefined), render: (r) => r.paid.toLocaleString('en-IN') },
    { key: 'outstanding', header: 'OUTSTANDING', align: 'right', bold: true, cellTone: (r) => (r.outstanding !== 0 ? 'negative' : undefined), render: (r) => r.outstanding.toLocaleString('en-IN') },
    { key: 'status', header: 'Status', align: 'center', render: (r) => (
      r.hasPending ? <Badge variant="outline">Pending</Badge> : <Badge variant="secondary">Closed</Badge>
    ) },
    {
      key: 'menu', header: '', align: 'center',
      render: (r) => (
        <RowMenu items={[
          { label: 'Pay', icon: Wallet, disabled: !r.hasPending, onSelect: () => { setPayRow(r); setPayAmount(String(r.outstanding)); setPayComment(''); } },
          { label: 'Write Off', icon: CheckCircle2, disabled: !r.hasPending, onSelect: () => { setWriteOffRow(r); setWriteOffReason(''); } },
          { label: 'Cancel', icon: Ban, destructive: true, disabled: !r.hasPending, onSelect: () => cancelPending(r) },
        ]} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Arrears"
        count={loading ? undefined : rows.length}
        actions={
          <>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="settled">Paid</SelectItem>
                <SelectItem value="written_off">Written off</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <ActionsMenu
              exportConfig={{
                filename: 'arrears',
                title: 'Arrears',
                rows,
                columns: [
                  { header: 'Employee', value: (r: ArrearRow) => r.staff.full_name },
                  { header: 'Created', value: (r: ArrearRow) => r.created },
                  { header: 'Paid', value: (r: ArrearRow) => r.paid },
                  { header: 'Outstanding', value: (r: ArrearRow) => r.outstanding },
                ],
              }}
            />
            <Button variant="outline" className="gap-1.5" onClick={() => { setAddOpen(true); setAddStaffId(''); setAddAmount(''); setAddComment(''); }}>
              <Plus className="h-4 w-4" /> Add Arrears
            </Button>
            <Button className="gap-1.5" disabled={rows.every((r) => !r.hasPending)} onClick={() => { const first = rows.find((r) => r.hasPending); if (first) { setPayRow(first); setPayAmount(String(first.outstanding)); setPayComment(''); } }}>
              <Wallet className="h-4 w-4" /> Pay Arrears
            </Button>
          </>
        }
      />

      <InlineNote>
        Pending arrears fold into that month's payroll automatically. Paying here settles them outside payroll and
        queues the payout; writing off closes them visibly with a reversing entry so the Trial Balance still
        reconciles.
      </InlineNote>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.staff.id}
        stickyColumns={1}
        loading={loading}
        defaultPageSize={50}
        empty={<EmptyState icon={Inbox} title="No arrears" instruction="Use + Add Arrears to record back-pay (positive) or a recovery (negative)." />}
      />

      {/* Add Arrears */}
      <Drawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Arrears"
        size="sm"
        footer={<Button className="w-full" onClick={saveAdd} disabled={busy}>{busy ? 'Saving…' : 'Add Arrears'}</Button>}
      >
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Employee *</Label>
            <Select value={addStaffId} onValueChange={setAddStaffId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {allStaff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Arrears Amount (₹) *</Label>
            <Input type="number" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} placeholder="positive = owed to employee, negative = recovery" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Transaction Date *</Label>
              <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Pay in month</Label>
              <Select value={addMonth} onValueChange={setAddMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((m) => <SelectItem key={m} value={m}>{format(new Date(m + '-01'), 'MMM yyyy')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Comment *</Label>
            <Textarea rows={2} value={addComment} onChange={(e) => setAddComment(e.target.value)} />
          </div>
        </div>
      </Drawer>

      {/* Pay Arrears */}
      <Drawer
        open={!!payRow}
        onOpenChange={(o) => !o && setPayRow(null)}
        title={payRow ? `Pay Arrears — ${payRow.staff.full_name}` : ''}
        size="sm"
        footer={<Button className="w-full" onClick={savePay} disabled={busy}>{busy ? 'Paying…' : 'Pay Arrears'}</Button>}
      >
        {payRow && (
          <div className="space-y-3.5">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              Outstanding Arrears: <span className="font-semibold">₹{payRow.outstanding.toLocaleString('en-IN')}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Arrears to Pay (₹) *</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Comment</Label>
              <Textarea rows={2} value={payComment} onChange={(e) => setPayComment(e.target.value)} />
            </div>
          </div>
        )}
      </Drawer>

      {/* Write Off */}
      <Drawer
        open={!!writeOffRow}
        onOpenChange={(o) => !o && setWriteOffRow(null)}
        title={writeOffRow ? `Write Off — ${writeOffRow.staff.full_name}` : ''}
        size="sm"
        description="Closes the pending arrears without paying them: posts a reversing journal entry (books stay balanced) and records who wrote it off and why."
        footer={<Button variant="destructive" className="w-full" onClick={saveWriteOff} disabled={busy}>{busy ? 'Working…' : 'Write Off'}</Button>}
      >
        {writeOffRow && (
          <div className="space-y-3.5">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              Writing off <span className="font-semibold">₹{Math.abs(writeOffRow.outstanding).toLocaleString('en-IN')}</span> pending arrears.
            </div>
            <div className="space-y-1.5">
              <Label>Reason (mandatory) *</Label>
              <Textarea rows={3} value={writeOffReason} onChange={(e) => setWriteOffReason(e.target.value)} placeholder="e.g. Left abruptly on 14 Aug; final days not payable per policy" />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
