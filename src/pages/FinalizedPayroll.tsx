import { useState } from 'react';
import { format, parseISO, subMonths } from 'date-fns';
import { CheckCircle2, Eye, Inbox, Unlock, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { toAmount } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Amount } from '@/components/ui/amount';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PageHeader, FilterBar, DateRangeField, ActionsMenu, DataTable, Drawer,
  RowMenu, EmptyState, InlineNote, ConfirmDestructive,
  type DataTableColumn, type DateRange,
} from '@/components/patterns';
import { toast } from '@/lib/toast';
import type { Staff } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 4A — Finalized Payroll: the record of what was actually paid.
// One row per (settlement month × outlet), grouped from salary_settlements
// (kept as the line-item store — no new table needed at this volume).
// ---------------------------------------------------------------------------

interface SettlementLine {
  id: string;
  staff_id: string;
  settlement_month: string;
  balance_payable: number;
  net_salary: number;
  present_days: number | null;
  absent_days: number | null;
  paid_leave_days: number | null;
  off_days: number | null;
  pf_employee: number;
  esi_employee: number;
  pt_amount: number;
  advances_adjusted: number;
  loan_emi_total: number;
  arrears: number | null;
  settled_at: string | null;
  settled_by: string | null;
  paid_at: string | null;
  [key: string]: unknown;
}

interface RunRow {
  key: string;
  month: string; // yyyy-MM
  outletId: string | null;
  outletName: string;
  lines: SettlementLine[];
  netFinalized: number;
  finalizedOn: string | null;
  finalizedBy: string;
  paidAmount: number;
  paidOn: string | null;
  locked: boolean;
}

interface Filters { outletId: string; range: DateRange }

export default function FinalizedPayroll() {
  const { user, staffData, can } = useAuth();
  const [applied, setApplied] = useState<Filters | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [staffById, setStaffById] = useState<Record<string, Staff>>({});
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [mastersLoaded, setMastersLoaded] = useState(false);
  const [snapshotRun, setSnapshotRun] = useState<RunRow | null>(null);
  const [definalizeRun, setDefinalizeRun] = useState<RunRow | null>(null);
  const [definalizeReason, setDefinalizeReason] = useState('');
  const [definalizeBusy, setDefinalizeBusy] = useState(false);
  const [markPaidRun, setMarkPaidRun] = useState<RunRow | null>(null);
  const [markPaidBusy, setMarkPaidBusy] = useState(false);

  const canLock = can('settlements.lock');

  const loadMasters = async () => {
    if (mastersLoaded) return;
    const { data } = await supabase.from('outlets').select('id, name').order('name');
    setOutlets((data ?? []) as { id: string; name: string }[]);
    setMastersLoaded(true);
  };

  const runSearch = async (filters: Filters) => {
    setApplied(filters);
    setLoading(true);
    try {
      const fromMonth = filters.range.from.slice(0, 7);
      const toMonth = filters.range.to.slice(0, 7);
      const [setRes, staffRes, lockRes] = await Promise.all([
        supabase.from('salary_settlements').select('*').gte('settlement_month', fromMonth).lte('settlement_month', toMonth),
        supabase.from('staff').select('*'),
        supabase.from('salary_sheet_locks' as never).select('month'),
      ]);
      if (setRes.error) throw setRes.error;

      const staffMap: Record<string, Staff> = {};
      for (const s of (staffRes.data ?? []) as Staff[]) staffMap[s.id] = s;
      setStaffById(staffMap);
      const lockedMonths = new Set(((lockRes.data ?? []) as unknown as { month: string }[]).map((l) => l.month));

      // Resolve "finalized by" names from staff user links.
      const nameByUser = new Map<string, string>();
      for (const s of Object.values(staffMap)) {
        const uid = (s as { user_id?: string | null }).user_id;
        if (uid) nameByUser.set(uid, s.full_name);
      }

      const groups = new Map<string, RunRow>();
      for (const line of (setRes.data ?? []) as unknown as SettlementLine[]) {
        const staffRow = staffMap[line.staff_id];
        const outletId = (staffRow as { outlet_id?: string | null } | undefined)?.outlet_id ?? null;
        if (filters.outletId !== 'all' && outletId !== filters.outletId) continue;
        const key = `${line.settlement_month}:${outletId ?? 'none'}`;
        let run = groups.get(key);
        if (!run) {
          run = {
            key,
            month: line.settlement_month,
            outletId,
            outletName: '—',
            lines: [],
            netFinalized: 0,
            finalizedOn: null,
            finalizedBy: '—',
            paidAmount: 0,
            paidOn: null,
            locked: lockedMonths.has(line.settlement_month),
          };
          groups.set(key, run);
        }
        run.lines.push(line);
        run.netFinalized += toAmount(line.balance_payable);
        if (line.paid_at) {
          run.paidAmount += toAmount(line.balance_payable);
          if (!run.paidOn || line.paid_at > run.paidOn) run.paidOn = line.paid_at;
        }
        if (line.settled_at && (!run.finalizedOn || line.settled_at > run.finalizedOn)) {
          run.finalizedOn = line.settled_at;
          run.finalizedBy = line.settled_by ? (nameByUser.get(line.settled_by) ?? 'User') : '—';
        }
      }
      const outletName = (id: string | null) => outlets.find((o) => o.id === id)?.name ?? (id ? 'Outlet' : 'No outlet');
      const list = [...groups.values()].map((r) => ({ ...r, outletName: outletName(r.outletId) }));
      list.sort((a, b) => (a.month === b.month ? a.outletName.localeCompare(b.outletName) : b.month.localeCompare(a.month)));
      setRuns(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load finalized payroll');
    } finally {
      setLoading(false);
    }
  };

  const recompute = () => { if (applied) runSearch(applied); };

  // ---- de-finalize ----------------------------------------------------------
  const doDefinalize = async () => {
    if (!definalizeRun || !definalizeReason.trim()) return;
    setDefinalizeBusy(true);
    try {
      // The audit entry (who + mandatory why) goes first — if it fails, nothing unlocks.
      const { error: logErr } = await supabase.rpc('log_payroll_action' as never, {
        _action: 'definalize_month',
        _scope: {
          month: definalizeRun.month,
          outlet: definalizeRun.outletName,
          reason: definalizeReason.trim(),
          lines: definalizeRun.lines.length,
          net: definalizeRun.netFinalized,
        },
      } as never);
      if (logErr) throw logErr;
      const { error } = await supabase.from('salary_sheet_locks' as never).delete().eq('month', definalizeRun.month);
      if (error) throw error;
      toast.success(`Salary sheet for ${format(parseISO(definalizeRun.month + '-01'), 'MMMM yyyy')} is unlocked — settlements are editable again.`);
      setDefinalizeRun(null);
      setDefinalizeReason('');
      recompute();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not de-finalize');
    } finally {
      setDefinalizeBusy(false);
    }
  };

  // ---- mark as paid ---------------------------------------------------------
  const doMarkPaid = async () => {
    if (!markPaidRun || !user?.id) return;
    setMarkPaidBusy(true);
    try {
      const unpaidIds = markPaidRun.lines.filter((l) => !l.paid_at).map((l) => l.id);
      if (unpaidIds.length === 0) { toast.message('Everything in this run is already paid.'); setMarkPaidRun(null); return; }
      const { error } = await supabase
        .from('salary_settlements')
        .update({
          paid_at: new Date().toISOString(),
          paid_by: user.id,
          paid_by_user_name: getUserDisplayName(user, staffData),
        } as never)
        .in('id', unpaidIds);
      if (error) throw error;
      toast.success(`Marked ${unpaidIds.length} settlement${unpaidIds.length === 1 ? '' : 's'} as paid. Their payout requests are on Advance Payouts.`);
      setMarkPaidRun(null);
      recompute();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark as paid');
    } finally {
      setMarkPaidBusy(false);
    }
  };

  // ---- table ----------------------------------------------------------------
  const monthBounds = (m: string) => {
    const start = parseISO(m + '-01');
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { from: format(start, 'dd MMM yyyy'), to: format(end, 'dd MMM yyyy') };
  };

  const columns: DataTableColumn<RunRow>[] = [
    { key: 'from', header: 'From', width: 120, render: (r) => monthBounds(r.month).from },
    { key: 'to', header: 'To', render: (r) => monthBounds(r.month).to },
    { key: 'outlet', header: 'Outlet', render: (r) => r.outletName },
    { key: 'net', header: 'Net Finalized', align: 'right', bold: true, render: (r) => r.netFinalized.toLocaleString('en-IN', { maximumFractionDigits: 0 }) },
    { key: 'fon', header: 'Finalized On', render: (r) => (r.finalizedOn ? format(new Date(r.finalizedOn), 'dd MMM yyyy') : '—') },
    { key: 'fby', header: 'Finalized By', render: (r) => r.finalizedBy },
    { key: 'paid', header: 'Paid Amount', align: 'right', render: (r) => r.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 }) },
    { key: 'paidon', header: 'Paid On', render: (r) => (r.paidOn ? format(new Date(r.paidOn), 'dd MMM yyyy') : '—') },
    {
      key: 'status', header: 'Status', align: 'center',
      render: (r) => r.paidAmount >= r.netFinalized && r.netFinalized > 0
        ? <Badge>Paid</Badge>
        : r.paidAmount > 0
          ? <Badge variant="secondary">Partially Paid</Badge>
          : <Badge variant="outline">{r.locked ? 'Finalized' : 'Settled'}</Badge>,
    },
    {
      key: 'menu', header: '', align: 'center',
      render: (r) => (
        <RowMenu items={[
          { label: 'View snapshot', icon: Eye, onSelect: () => setSnapshotRun(r) },
          { label: 'Mark as Paid', icon: CheckCircle2, disabled: r.paidAmount >= r.netFinalized, onSelect: () => setMarkPaidRun(r) },
          { label: 'De-finalize', icon: Unlock, destructive: true, disabled: !canLock || !r.locked, onSelect: () => setDefinalizeRun(r) },
        ]} />
      ),
    },
  ];

  const initialRange: DateRange = {
    from: format(subMonths(new Date(), 3), 'yyyy-MM-01'),
    to: format(new Date(), 'yyyy-MM-dd'),
  };

  const snapshotColumns: DataTableColumn<SettlementLine>[] = [
    { key: 'emp', header: 'Employee', width: 190, render: (l) => (
      <div>
        <p className="truncate font-medium leading-tight">{staffById[l.staff_id]?.full_name ?? '—'}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{staffById[l.staff_id]?.employee_id ?? ''}</p>
      </div>
    ) },
    { key: 'present', header: 'Present', align: 'center', render: (l) => l.present_days ?? 0 },
    { key: 'leave', header: 'Leave', align: 'center', render: (l) => l.paid_leave_days ?? 0 },
    { key: 'off', header: 'Off', align: 'center', render: (l) => l.off_days ?? 0 },
    { key: 'absent', header: 'Absent', align: 'center', cellTone: (l) => ((l.absent_days ?? 0) > 0 ? 'negative' : undefined), render: (l) => l.absent_days ?? 0 },
    { key: 'earned', header: 'Earned', align: 'right', render: (l) => toAmount(l.net_salary).toLocaleString('en-IN') },
    { key: 'pf', header: 'PF', align: 'right', render: (l) => toAmount(l.pf_employee).toLocaleString('en-IN') },
    { key: 'esi', header: 'ESI', align: 'right', render: (l) => toAmount(l.esi_employee).toLocaleString('en-IN') },
    { key: 'pt', header: 'PT', align: 'right', render: (l) => toAmount(l.pt_amount).toLocaleString('en-IN') },
    { key: 'adv', header: 'Advance', align: 'right', render: (l) => toAmount(l.advances_adjusted).toLocaleString('en-IN') },
    { key: 'emi', header: 'Loan EMI', align: 'right', render: (l) => toAmount(l.loan_emi_total).toLocaleString('en-IN') },
    { key: 'net', header: 'NET', align: 'right', bold: true, render: (l) => toAmount(l.balance_payable).toLocaleString('en-IN') },
    { key: 'paidflag', header: 'Paid', align: 'center', render: (l) => (l.paid_at ? <Badge>Paid</Badge> : <Badge variant="outline">Due</Badge>) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finalized Payroll"
        count={applied ? runs.length : undefined}
        actions={
          <ActionsMenu
            exportConfig={{
              filename: 'finalized-payroll',
              title: 'Finalized Payroll',
              rows: runs,
              columns: [
                { header: 'Month', value: (r: RunRow) => r.month },
                { header: 'Outlet', value: (r: RunRow) => r.outletName },
                { header: 'Net Finalized', value: (r: RunRow) => r.netFinalized },
                { header: 'Finalized On', value: (r: RunRow) => r.finalizedOn ?? '' },
                { header: 'Finalized By', value: (r: RunRow) => r.finalizedBy },
                { header: 'Paid Amount', value: (r: RunRow) => r.paidAmount },
                { header: 'Paid On', value: (r: RunRow) => r.paidOn ?? '' },
              ],
            }}
          />
        }
      />

      <div onFocusCapture={loadMasters} onPointerEnter={loadMasters}>
        <FilterBar<Filters>
          initial={{ outletId: 'all', range: initialRange }}
          onSearch={runSearch}
        >
          {(draft, setDraft) => (
            <>
              <Select value={draft.outletId} onValueChange={(v) => setDraft({ ...draft, outletId: v })}>
                <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Outlet" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outlets</SelectItem>
                  {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <DateRangeField value={draft.range} onChange={(range) => setDraft({ ...draft, range })} />
            </>
          )}
        </FilterBar>
      </div>

      <InlineNote>
        De-finalizing unlocks a month's salary sheet so its settlements can be corrected on Process Payroll — every
        de-finalize records who did it and why in the activity log.
      </InlineNote>

      <DataTable
        columns={columns}
        rows={runs}
        rowKey={(r) => r.key}
        stickyColumns={1}
        loading={loading}
        empty={
          <EmptyState
            icon={Inbox}
            title={applied ? 'No finalized payroll in this period' : 'Nothing loaded yet'}
            instruction={applied ? 'Widen the date range above and press Search again.' : 'Choose a date range above and press Search.'}
          />
        }
      />

      {/* Snapshot drawer */}
      <Drawer
        open={!!snapshotRun}
        onOpenChange={(o) => !o && setSnapshotRun(null)}
        title={snapshotRun ? `${format(parseISO(snapshotRun.month + '-01'), 'MMMM yyyy')} — ${snapshotRun.outletName}` : ''}
        size="lg"
        description="Read-only snapshot of every settled line in this run."
        footer={
          snapshotRun && (
            <ActionsMenu
              exportConfig={{
                filename: `payroll-run-${snapshotRun.month}-${snapshotRun.outletName}`,
                title: `Payroll ${snapshotRun.month} — ${snapshotRun.outletName}`,
                rows: snapshotRun.lines,
                columns: [
                  { header: 'Employee', value: (l: SettlementLine) => staffById[l.staff_id]?.full_name ?? '' },
                  { header: 'Code', value: (l: SettlementLine) => staffById[l.staff_id]?.employee_id ?? '' },
                  { header: 'Earned', value: (l: SettlementLine) => toAmount(l.net_salary) },
                  { header: 'PF', value: (l: SettlementLine) => toAmount(l.pf_employee) },
                  { header: 'ESI', value: (l: SettlementLine) => toAmount(l.esi_employee) },
                  { header: 'PT', value: (l: SettlementLine) => toAmount(l.pt_amount) },
                  { header: 'Advance', value: (l: SettlementLine) => toAmount(l.advances_adjusted) },
                  { header: 'Loan EMI', value: (l: SettlementLine) => toAmount(l.loan_emi_total) },
                  { header: 'Net Payable', value: (l: SettlementLine) => toAmount(l.balance_payable) },
                  { header: 'Paid', value: (l: SettlementLine) => (l.paid_at ? 'Yes' : 'No') },
                ],
              }}
            />
          )
        }
      >
        {snapshotRun && (
          <DataTable
            columns={snapshotColumns}
            rows={snapshotRun.lines}
            rowKey={(l) => l.id}
            stickyColumns={1}
            defaultPageSize={50}
          />
        )}
      </Drawer>

      {/* De-finalize */}
      <ConfirmDestructive
        open={!!definalizeRun}
        onOpenChange={(o) => { if (!o) { setDefinalizeRun(null); setDefinalizeReason(''); } }}
        title="De-finalize this payroll run?"
        recordName={definalizeRun ? `${format(parseISO(definalizeRun.month + '-01'), 'MMMM yyyy')} — ${definalizeRun.outletName}` : ''}
        confirmText="DE-FINALIZE"
        description="This unlocks the month's salary sheet: its settlements become changeable again on Process Payroll. Payslips already handed out may no longer match."
        onConfirm={doDefinalize}
        loading={definalizeBusy}
        proceedLabel="Proceed"
        canProceed={definalizeReason.trim().length > 0}
      >
        <div className="space-y-1.5">
          <Label>Reason (mandatory) *</Label>
          <Textarea rows={2} value={definalizeReason} onChange={(e) => setDefinalizeReason(e.target.value)} placeholder="Why is this run being de-finalized?" />
        </div>
      </ConfirmDestructive>

      {/* Mark as paid */}
      <Drawer
        open={!!markPaidRun}
        onOpenChange={(o) => !o && setMarkPaidRun(null)}
        title={markPaidRun ? `Mark as Paid — ${format(parseISO(markPaidRun.month + '-01'), 'MMMM yyyy')} (${markPaidRun.outletName})` : ''}
        size="sm"
        footer={
          <button
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={markPaidBusy}
            onClick={doMarkPaid}
          >
            <Wallet className="h-4 w-4" /> {markPaidBusy ? 'Working…' : 'Mark run as paid'}
          </button>
        }
      >
        {markPaidRun && (
          <div className="space-y-2 text-sm">
            <p>
              This records today as the paid date on{' '}
              <span className="font-semibold">{markPaidRun.lines.filter((l) => !l.paid_at).length}</span> unpaid
              settlement{markPaidRun.lines.filter((l) => !l.paid_at).length === 1 ? '' : 's'} totalling{' '}
              <Amount value={markPaidRun.netFinalized - markPaidRun.paidAmount} size="sm" className="font-semibold" />.
            </p>
            <p className="text-muted-foreground">
              The corresponding payout requests remain on Advance Payouts for the money movement itself.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
