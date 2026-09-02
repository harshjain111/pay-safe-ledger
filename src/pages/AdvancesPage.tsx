import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { HandCoins, History as HistoryIcon, Inbox, Pencil, Plus, ShieldX, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName } from '@/lib/get-user-display-name';
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
import { createAdvancePaidEntry, getStaffJournalEntries } from '@/lib/journal-entries';
import type { PaymentMode, Staff, StaffLoan } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 6 — /settlements/advances. One row per employee holding advance/loan
// instruments. Installments are recovered automatically each payroll run
// (getLoanEMIsForMonth caps at the remaining balance; the settle path posts
// the journal and decrements the balance) — the manager never types a
// recovery amount. Row verbs are Attendo's: Debit Amount / Transaction Logs /
// Edit Installment.
// ---------------------------------------------------------------------------

type LoanRow = StaffLoan & { name?: string | null; loan_type?: string };

interface AdvRow {
  staff: Staff;
  loans: LoanRow[];
  count: number;
  totalAmount: number;
  totalRecovered: number;
  outstanding: number;
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

export default function AdvancesPage() {
  const { user, staffData, can } = useAuth();
  const canManage = can('payouts.execute');

  const [rows, setRows] = useState<AdvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'active' | 'closed' | 'all'>('active');

  // Drawers
  const [addOpen, setAddOpen] = useState(false);
  const [debitRow, setDebitRow] = useState<AdvRow | null>(null);
  const [logsRow, setLogsRow] = useState<AdvRow | null>(null);
  const [logs, setLogs] = useState<{ id: string; entry_date: string; description: string; transaction_type: string }[]>([]);
  const [installmentRow, setInstallmentRow] = useState<AdvRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Add Advance form
  const [addStaffId, setAddStaffId] = useState('');
  const [addName, setAddName] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addType, setAddType] = useState<'advance' | 'loan'>('advance');
  const [addEmi, setAddEmi] = useState('');
  const [addDate, setAddDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [addComment, setAddComment] = useState('');
  const [addMode, setAddMode] = useState<PaymentMode>('cash');
  const [allStaff, setAllStaff] = useState<Staff[]>([]);

  // Debit form
  const [debitAmount, setDebitAmount] = useState('');
  const [debitDate, setDebitDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [debitComment, setDebitComment] = useState('');
  const [debitMode, setDebitMode] = useState<PaymentMode>('cash');

  // Edit installment form
  const [instLoanId, setInstLoanId] = useState('');
  const [instAmount, setInstAmount] = useState('');
  const [instReason, setInstReason] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const [loanRes, staffRes] = await Promise.all([
        supabase.from('staff_loans').select('*').order('created_at', { ascending: false }),
        supabase.from('staff').select('*').order('full_name'),
      ]);
      if (loanRes.error) throw loanRes.error;
      const staffMap = new Map<string, Staff>();
      for (const s of (staffRes.data ?? []) as Staff[]) staffMap.set(s.id, s);
      setAllStaff(((staffRes.data ?? []) as Staff[]).filter((s) => s.is_active));

      const byStaff = new Map<string, LoanRow[]>();
      for (const l of (loanRes.data ?? []) as unknown as LoanRow[]) {
        const list = byStaff.get(l.staff_id) ?? [];
        list.push(l);
        byStaff.set(l.staff_id, list);
      }
      const built: AdvRow[] = [];
      for (const [staffId, loans] of byStaff) {
        const staff = staffMap.get(staffId);
        if (!staff) continue;
        const scoped = loans.filter((l) =>
          statusFilter === 'all' ? true : statusFilter === 'active' ? l.status === 'active' : l.status !== 'active',
        );
        if (scoped.length === 0) continue;
        const totalAmount = scoped.reduce((s, l) => s + toAmount(l.principal), 0);
        const outstanding = scoped.reduce((s, l) => s + toAmount(l.remaining_balance), 0);
        built.push({
          staff,
          loans: scoped,
          count: scoped.length,
          totalAmount,
          totalRecovered: totalAmount - outstanding,
          outstanding,
        });
      }
      built.sort((a, b) => b.outstanding - a.outstanding);
      setRows(built);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load advances');
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
    return <EmptyState icon={ShieldX} title="Access denied" instruction="Advances need the 'Execute payouts' permission — ask an owner." />;
  }

  const openAdd = () => {
    setAddStaffId(''); setAddName(''); setAddAmount(''); setAddType('advance');
    setAddEmi(''); setAddDate(format(new Date(), 'yyyy-MM-dd')); setAddComment(''); setAddMode('cash');
    setAddOpen(true);
  };

  const saveAdd = async () => {
    const amount = toAmount(addAmount);
    const emi = toAmount(addEmi);
    if (!addStaffId) { toast.error('Pick an employee'); return; }
    if (!addName.trim()) { toast.error('Give the advance/loan a name'); return; }
    if (!amount || amount <= 0) { toast.error('Enter a positive amount'); return; }
    if (!emi || emi <= 0) { toast.error('Enter the monthly installment'); return; }
    if (!user?.id) return;
    setBusy(true);
    try {
      const staff = allStaff.find((s) => s.id === addStaffId);
      // 1) the instrument (auto-recovered by payroll via its EMI)
      const { error } = await supabase.from('staff_loans').insert({
        staff_id: addStaffId,
        name: addName.trim(),
        loan_type: addType,
        principal: amount,
        emi_amount: emi,
        start_month: addDate.slice(0, 7),
        remaining_balance: amount,
        status: 'active',
        notes: addComment.trim() || null,
        created_by: user.id,
      } as never);
      if (error) throw error;
      // 2) the money-out journal (ledger stays the source of truth)
      await createAdvancePaidEntry({
        staffId: addStaffId,
        staffName: staff?.full_name ?? 'Staff',
        amount,
        paymentMode: addMode,
        createdBy: user.id,
        paidByUserId: user.id,
        paidByUserName: getUserDisplayName(user, staffData),
      });
      toast.success(`${addType === 'loan' ? 'Loan' : 'Advance'} of ₹${amount.toLocaleString('en-IN')} recorded — ₹${emi.toLocaleString('en-IN')}/month recovers automatically at payroll.`);
      setAddOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add the advance');
    } finally {
      setBusy(false);
    }
  };

  const saveDebit = async () => {
    if (!debitRow || !user?.id) return;
    const amount = toAmount(debitAmount);
    if (!amount || amount <= 0) { toast.error('Enter a positive amount'); return; }
    setBusy(true);
    try {
      await createAdvancePaidEntry({
        staffId: debitRow.staff.id,
        staffName: debitRow.staff.full_name,
        amount,
        paymentMode: debitMode,
        createdBy: user.id,
        paidByUserId: user.id,
        paidByUserName: getUserDisplayName(user, staffData),
      });
      // Track the extra principal on the staff member's most recent active instrument.
      const active = debitRow.loans.find((l) => l.status === 'active');
      if (active) {
        await supabase.from('staff_loans').update({
          principal: toAmount(active.principal) + amount,
          remaining_balance: toAmount(active.remaining_balance) + amount,
          notes: [active.notes, `Debit ₹${amount} on ${debitDate}${debitComment ? ` — ${debitComment}` : ''}`].filter(Boolean).join('\n'),
        } as never).eq('id', active.id);
      }
      toast.success(`Debited ₹${amount.toLocaleString('en-IN')} to ${debitRow.staff.full_name}.`);
      setDebitRow(null);
      setDebitAmount(''); setDebitComment('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the debit');
    } finally {
      setBusy(false);
    }
  };

  const openLogs = async (row: AdvRow) => {
    setLogsRow(row);
    setLogs([]);
    try {
      const entries = await getStaffJournalEntries(row.staff.id);
      const relevant = (entries as { id: string; entry_date: string; description: string; transaction_type: string }[])
        .filter((e) => e.transaction_type === 'advance_paid' || /advance|loan/i.test(e.description ?? ''));
      setLogs(relevant.slice(0, 50));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load transaction logs');
    }
  };

  const saveInstallment = async () => {
    if (!installmentRow) return;
    const amount = toAmount(instAmount);
    const loan = installmentRow.loans.find((l) => l.id === instLoanId);
    if (!loan) { toast.error('Pick the instrument'); return; }
    if (!amount || amount <= 0) { toast.error('Enter the new monthly installment'); return; }
    if (!instReason.trim()) { toast.error('A reason is mandatory'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('staff_loans').update({
        emi_amount: amount,
        notes: [loan.notes, `Installment changed to ₹${amount}: ${instReason.trim()}`].filter(Boolean).join('\n'),
      } as never).eq('id', loan.id);
      if (error) throw error;
      toast.success('Installment updated — the next payroll run recovers the new amount.');
      setInstallmentRow(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the installment');
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<AdvRow>[] = [
    { key: 'emp', header: 'Employee', width: 220, render: (r) => (
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{r.staff.full_name}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{r.staff.employee_id}</p>
        </div>
        {!r.staff.is_active && <Badge variant="destructive" className="shrink-0 text-[10px]">Terminated</Badge>}
      </div>
    ) },
    { key: 'count', header: 'Count', align: 'center', render: (r) => r.count },
    { key: 'total', header: 'Total Amount', align: 'right', render: (r) => r.totalAmount.toLocaleString('en-IN') },
    { key: 'recovered', header: 'Total Recovered', align: 'right', cellTone: (r) => (r.totalRecovered > 0 ? 'positive' : undefined), render: (r) => r.totalRecovered.toLocaleString('en-IN') },
    { key: 'outstanding', header: 'OUTSTANDING', align: 'right', bold: true, render: (r) => r.outstanding.toLocaleString('en-IN') },
    {
      key: 'menu', header: '', align: 'center',
      render: (r) => (
        <RowMenu items={[
          { label: 'Debit Amount', icon: HandCoins, onSelect: () => { setDebitRow(r); setDebitAmount(''); setDebitComment(''); setDebitMode('cash'); setDebitDate(format(new Date(), 'yyyy-MM-dd')); } },
          { label: 'Transaction Logs', icon: HistoryIcon, onSelect: () => openLogs(r) },
          { label: 'Edit Installment', icon: Pencil, onSelect: () => { setInstallmentRow(r); setInstLoanId(r.loans.find((l) => l.status === 'active')?.id ?? r.loans[0]?.id ?? ''); setInstAmount(''); setInstReason(''); } },
        ]} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Advances"
        count={loading ? undefined : rows.length}
        actions={
          <>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <ActionsMenu
              exportConfig={{
                filename: 'advances',
                title: 'Advances',
                rows,
                columns: [
                  { header: 'Employee', value: (r: AdvRow) => r.staff.full_name },
                  { header: 'Code', value: (r: AdvRow) => r.staff.employee_id },
                  { header: 'Count', value: (r: AdvRow) => r.count },
                  { header: 'Total Amount', value: (r: AdvRow) => r.totalAmount },
                  { header: 'Total Recovered', value: (r: AdvRow) => r.totalRecovered },
                  { header: 'Outstanding', value: (r: AdvRow) => r.outstanding },
                ],
              }}
            />
            <Button className="gap-1.5" onClick={openAdd}><Plus className="h-4 w-4" /> Add Advance</Button>
          </>
        }
      />

      <InlineNote>
        Installments are recovered automatically on each payroll run (capped at the remaining balance) — nobody types
        a recovery amount. The advance ledger balance itself lives in the journals.
      </InlineNote>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.staff.id}
        stickyColumns={1}
        loading={loading}
        defaultPageSize={50}
        empty={<EmptyState icon={Inbox} title="No advances or loans" instruction="Use the + Add Advance button above to issue one." />}
      />

      {/* Add Advance */}
      <Drawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Advance"
        size="md"
        footer={<Button className="w-full" onClick={saveAdd} disabled={busy}>{busy ? 'Saving…' : 'Add Advance'}</Button>}
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
            <Label>Loan/Advance Name *</Label>
            <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Festival advance" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={addType} onValueChange={(v) => setAddType(v as 'advance' | 'loan')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="loan">Loan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Monthly Installment (₹) *</Label>
            <Input type="number" min="0" value={addEmi} onChange={(e) => setAddEmi(e.target.value)} />
            <p className="text-xs text-muted-foreground">This will be added to the employee's total monthly installment.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Transaction Date *</Label>
              <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Paid via</Label>
              <Select value={addMode} onValueChange={(v) => setAddMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Comment</Label>
            <Textarea rows={2} value={addComment} onChange={(e) => setAddComment(e.target.value)} />
          </div>
        </div>
      </Drawer>

      {/* Debit Amount */}
      <Drawer
        open={!!debitRow}
        onOpenChange={(o) => !o && setDebitRow(null)}
        title={debitRow ? `Debit Amount — ${debitRow.staff.full_name}` : ''}
        size="sm"
        description="Pays out more money against this employee's advance (posts a journal entry)."
        footer={<Button className="w-full" onClick={saveDebit} disabled={busy}>{busy ? 'Saving…' : 'Debit Amount'}</Button>}
      >
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Amount (₹) *</Label>
            <Input type="number" min="0" value={debitAmount} onChange={(e) => setDebitAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={debitDate} onChange={(e) => setDebitDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Paid via</Label>
              <Select value={debitMode} onValueChange={(v) => setDebitMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Comment</Label>
            <Textarea rows={2} value={debitComment} onChange={(e) => setDebitComment(e.target.value)} />
          </div>
        </div>
      </Drawer>

      {/* Transaction Logs */}
      <Drawer
        open={!!logsRow}
        onOpenChange={(o) => !o && setLogsRow(null)}
        title={logsRow ? `Transaction Logs — ${logsRow.staff.full_name}` : ''}
        size="md"
      >
        {logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No advance or loan transactions recorded.</p>
        ) : (
          <div className="divide-y rounded-lg border text-sm">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{l.description}</p>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(l.entry_date), 'dd MMM yyyy')} · {l.transaction_type}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* Edit Installment */}
      <Drawer
        open={!!installmentRow}
        onOpenChange={(o) => !o && setInstallmentRow(null)}
        title={installmentRow ? `Edit Installment — ${installmentRow.staff.full_name}` : ''}
        size="sm"
        footer={<Button className="w-full" onClick={saveInstallment} disabled={busy}>{busy ? 'Saving…' : 'Save installment'}</Button>}
      >
        {installmentRow && (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Instrument</Label>
              <Select value={instLoanId} onValueChange={setInstLoanId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {installmentRow.loans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {(l.name || l.loan_type || 'Loan')} · ₹{toAmount(l.emi_amount).toLocaleString('en-IN')}/mo · bal ₹{toAmount(l.remaining_balance).toLocaleString('en-IN')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New Monthly Installment (₹) *</Label>
              <Input type="number" min="0" value={instAmount} onChange={(e) => setInstAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea rows={2} value={instReason} onChange={(e) => setInstReason(e.target.value)} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
