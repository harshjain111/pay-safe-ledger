import { useState } from 'react';
import { differenceInCalendarMonths, format, parseISO } from 'date-fns';
import { Inbox, Pencil, ShieldX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PageHeader, FilterBar, ActionsMenu, DataTable, Drawer, RowMenu, EmptyState,
  type DataTableColumn,
} from '@/components/patterns';
import { toast } from '@/lib/toast';
import { toAmount } from '@/lib/utils';
import type { Staff } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 4B — Salary Increments. Reads the EXISTING salary_history table; every
// revision goes through the EXISTING bulk_update_salaries RPC (the only writer
// of salary_history — writing staff.monthly_salary directly would silently
// stop increment tracking). Replaces the old BulkSalaryDialog.
// ---------------------------------------------------------------------------

interface HistoryRow {
  staff_id: string;
  monthly_salary: number;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
}

interface IncrementRow {
  staff: Staff;
  currentSalary: number;
  previousSalary: number | null;
  changeAmount: number | null;
  changePct: number | null;
  lastRevised: string | null; // null = never revised -> measured from joining
  monthsSince: number;
  due: boolean;
}

interface Filters { outletId: string; department: string; status: 'all' | 'due' | 'notdue' }

const DUE_AFTER_MONTHS = 12;

export default function SalaryIncrements() {
  const { can, isOwner } = useAuth();
  const [applied, setApplied] = useState<Filters | null>(null);
  const [rows, setRows] = useState<IncrementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [mastersLoaded, setMastersLoaded] = useState(false);

  // Revise drawer (single row or the multi-select).
  const [reviseTargets, setReviseTargets] = useState<IncrementRow[]>([]);
  const [reviseMode, setReviseMode] = useState<'amount' | 'percent'>('amount');
  const [reviseValue, setReviseValue] = useState('');
  const [reviseFrom, setReviseFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reviseReason, setReviseReason] = useState('');
  const [reviseBusy, setReviseBusy] = useState(false);

  const canRevise = isOwner || can('salaries.edit');

  const loadMasters = async () => {
    if (mastersLoaded) return;
    const [o, d] = await Promise.all([
      supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
      supabase.from('departments').select('name').eq('is_active', true).order('name'),
    ]);
    setOutlets((o.data ?? []) as { id: string; name: string }[]);
    setDepartments(((d.data ?? []) as { name: string }[]).map((r) => r.name));
    setMastersLoaded(true);
  };

  const runSearch = async (filters: Filters) => {
    setApplied(filters);
    setSelected(new Set());
    setLoading(true);
    try {
      let staffQuery = supabase.from('staff').select('*').eq('is_active', true).order('full_name');
      if (filters.outletId !== 'all') staffQuery = staffQuery.eq('outlet_id', filters.outletId);
      if (filters.department !== 'all') staffQuery = staffQuery.eq('department', filters.department);
      const [staffRes, histRes] = await Promise.all([
        staffQuery,
        supabase.from('salary_history' as never).select('staff_id, monthly_salary, effective_from, effective_to, change_reason').order('effective_from', { ascending: false }),
      ]);
      if (staffRes.error) throw staffRes.error;

      const histByStaff = new Map<string, HistoryRow[]>();
      for (const h of ((histRes.data ?? []) as unknown as HistoryRow[])) {
        const list = histByStaff.get(h.staff_id) ?? [];
        list.push(h);
        histByStaff.set(h.staff_id, list);
      }

      const today = new Date();
      const built: IncrementRow[] = ((staffRes.data ?? []) as Staff[]).map((staff) => {
        const hist = histByStaff.get(staff.id) ?? [];
        // "Last revised" = effective_from of the latest CLOSED interval's
        // successor — i.e. the newest row that has a predecessor. A staff with
        // one open row (their joining salary) has never been revised.
        const closed = hist.filter((h) => h.effective_to !== null);
        const lastRevised = closed.length > 0
          ? hist.find((h) => h.effective_to === null)?.effective_from ?? hist[0].effective_from
          : null;
        const previousSalary = closed.length > 0 ? toAmount(closed[0].monthly_salary) : null;
        const currentSalary = toAmount(staff.monthly_salary ?? 0);
        // Client-confirmed: no history -> measure from date_of_joining.
        const measureFrom = lastRevised ?? staff.date_of_joining;
        const monthsSince = Math.max(0, differenceInCalendarMonths(today, parseISO(measureFrom)));
        return {
          staff,
          currentSalary,
          previousSalary,
          changeAmount: previousSalary != null ? currentSalary - previousSalary : null,
          changePct: previousSalary ? ((currentSalary - previousSalary) / previousSalary) * 100 : null,
          lastRevised,
          monthsSince,
          due: monthsSince >= DUE_AFTER_MONTHS,
        };
      });

      const filtered = built.filter((r) =>
        filters.status === 'all' ? true : filters.status === 'due' ? r.due : !r.due,
      );
      // Most overdue at the top.
      filtered.sort((a, b) => b.monthsSince - a.monthsSince);
      setRows(filtered);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load salary increments');
    } finally {
      setLoading(false);
    }
  };

  const recompute = () => { if (applied) runSearch(applied); };

  const openRevise = (targets: IncrementRow[]) => {
    setReviseTargets(targets);
    setReviseMode('amount');
    setReviseValue('');
    setReviseFrom(format(new Date(), 'yyyy-MM-dd'));
    setReviseReason('');
  };

  const doRevise = async () => {
    const value = Number(reviseValue);
    if (!value || Number.isNaN(value)) { toast.error('Enter the new salary, flat change, or percentage'); return; }
    if (!reviseReason.trim()) { toast.error('A reason is mandatory'); return; }
    setReviseBusy(true);
    try {
      const single = reviseTargets.length === 1;
      const changes = reviseTargets.map((t) => {
        let newSalary: number;
        if (single && reviseMode === 'amount') newSalary = value; // absolute new salary
        else if (reviseMode === 'amount') newSalary = t.currentSalary + value; // flat change for bulk
        else newSalary = t.currentSalary * (1 + value / 100);
        return {
          staff_id: t.staff.id,
          monthly_salary: Math.round(newSalary * 100) / 100,
          reason: `${reviseReason.trim()} (effective ${reviseFrom})`,
        };
      });
      const { data, error } = await supabase.rpc('bulk_update_salaries' as never, { _changes: changes } as never);
      if (error) throw error;
      const summary = data as unknown as { updated: number } | null;
      toast.success(`Revised ${summary?.updated ?? changes.length} salar${(summary?.updated ?? changes.length) === 1 ? 'y' : 'ies'}.`);
      setReviseTargets([]);
      setSelected(new Set());
      recompute();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revise salaries');
    } finally {
      setReviseBusy(false);
    }
  };

  if (!canRevise && !can('salaries.view')) {
    return <EmptyState icon={ShieldX} title="Access denied" instruction="Salary increments need the salary permissions — ask an owner." />;
  }

  const columns: DataTableColumn<IncrementRow>[] = [
    { key: 'emp', header: 'Employee', width: 210, cellTone: (r) => (r.due ? 'negative' : undefined), render: (r) => (
      <div>
        <p className="truncate font-medium leading-tight">{r.staff.full_name}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{r.staff.employee_id}{r.staff.department ? ` - ${r.staff.department}` : ''}</p>
      </div>
    ) },
    { key: 'current', header: 'Current Salary', align: 'right', bold: true, render: (r) => r.currentSalary.toLocaleString('en-IN') },
    { key: 'prev', header: 'Previous Salary', align: 'right', render: (r) => (r.previousSalary != null ? r.previousSalary.toLocaleString('en-IN') : '—') },
    { key: 'chg', header: 'Change ₹', align: 'right', cellTone: (r) => (r.changeAmount == null ? undefined : r.changeAmount >= 0 ? 'positive' : 'negative'), render: (r) => (r.changeAmount != null ? r.changeAmount.toLocaleString('en-IN') : '—') },
    { key: 'chgpct', header: 'Change %', align: 'right', render: (r) => (r.changePct != null ? `${r.changePct.toFixed(1)}%` : '—') },
    { key: 'last', header: 'Last Revised', render: (r) => (r.lastRevised ? format(parseISO(r.lastRevised), 'dd MMM yyyy') : <span className="text-muted-foreground">Never revised</span>) },
    { key: 'months', header: 'Months Since', align: 'center', cellTone: (r) => (r.due ? 'negative' : undefined), render: (r) => r.monthsSince },
    { key: 'due', header: 'Due', align: 'center', render: (r) => (r.due ? <Badge variant="destructive">Due</Badge> : <Badge variant="outline">Not due</Badge>) },
    {
      key: 'menu', header: '', align: 'center',
      render: (r) => (
        <RowMenu items={[
          { label: 'Revise Salary', icon: Pencil, disabled: !canRevise, onSelect: () => openRevise([r]) },
        ]} />
      ),
    },
  ];

  const selectedRows = rows.filter((r) => selected.has(r.staff.id));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Salary Increments"
        count={applied ? rows.length : undefined}
        actions={
          <>
            <ActionsMenu
              exportConfig={{
                filename: 'salary-increments',
                title: 'Salary Increments',
                rows,
                columns: [
                  { header: 'Employee', value: (r: IncrementRow) => r.staff.full_name },
                  { header: 'Code', value: (r: IncrementRow) => r.staff.employee_id },
                  { header: 'Current Salary', value: (r: IncrementRow) => r.currentSalary },
                  { header: 'Previous Salary', value: (r: IncrementRow) => r.previousSalary ?? '' },
                  { header: 'Change', value: (r: IncrementRow) => r.changeAmount ?? '' },
                  { header: 'Last Revised', value: (r: IncrementRow) => r.lastRevised ?? 'Never revised' },
                  { header: 'Months Since', value: (r: IncrementRow) => r.monthsSince },
                  { header: 'Due', value: (r: IncrementRow) => (r.due ? 'Yes' : 'No') },
                ],
              }}
            />
            <Button disabled={selectedRows.length === 0 || !canRevise} onClick={() => openRevise(selectedRows)}>
              Revise Selected{selectedRows.length ? ` (${selectedRows.length})` : ''}
            </Button>
          </>
        }
      />

      <div onFocusCapture={loadMasters} onPointerEnter={loadMasters}>
        <FilterBar<Filters>
          initial={{ outletId: 'all', department: 'all', status: 'all' }}
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
              <Select value={draft.department} onValueChange={(v) => setDraft({ ...draft, department: v })}>
                <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Filters['status'] })}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="due">Due</SelectItem>
                  <SelectItem value="notdue">Not due</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </FilterBar>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.staff.id}
        stickyColumns={1}
        selectable={canRevise}
        selected={selected}
        onSelectedChange={setSelected}
        loading={loading}
        defaultPageSize={50}
        selectionSummary={<span className="text-muted-foreground">ready to revise</span>}
        empty={
          <EmptyState
            icon={Inbox}
            title={applied ? 'No staff match these filters' : 'Nothing loaded yet'}
            instruction={applied ? 'Widen the filters above and press Search again.' : 'Choose your filters above and press Search.'}
          />
        }
      />

      {/* Revise drawer — single AND multi-select share it. */}
      <Drawer
        open={reviseTargets.length > 0}
        onOpenChange={(o) => !o && setReviseTargets([])}
        title={reviseTargets.length === 1 ? `Revise Salary — ${reviseTargets[0].staff.full_name}` : `Revise ${reviseTargets.length} Salaries`}
        size="md"
        description="Both paths write through the bulk_update_salaries RPC — the only writer of salary_history."
        footer={
          <Button className="w-full" onClick={doRevise} disabled={reviseBusy}>
            {reviseBusy ? 'Revising…' : 'Revise Salary'}
          </Button>
        }
      >
        <div className="space-y-4">
          {reviseTargets.length === 1 ? (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              Current salary: <span className="font-semibold">₹{reviseTargets[0].currentSalary.toLocaleString('en-IN')}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Apply as</Label>
              <Select value={reviseMode} onValueChange={(v) => setReviseMode(v as 'amount' | 'percent')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">Flat amount (₹) added to each salary</SelectItem>
                  <SelectItem value="percent">Percentage (%) of each salary</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>
              {reviseTargets.length === 1
                ? 'New Monthly Salary (₹) *'
                : reviseMode === 'amount' ? 'Flat change (₹, can be negative) *' : 'Percentage change (%, can be negative) *'}
            </Label>
            <Input type="number" value={reviseValue} onChange={(e) => setReviseValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective From *</Label>
            <Input type="date" value={reviseFrom} onChange={(e) => setReviseFrom(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              The RPC records revisions effective today; the chosen date is kept in the change reason for the record.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (mandatory) *</Label>
            <Textarea rows={2} value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} placeholder="Annual review, promotion, correction…" />
          </div>
          {reviseTargets.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Applies to {reviseTargets.length} selected staff. Salaries that would not change are skipped automatically.
            </p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
