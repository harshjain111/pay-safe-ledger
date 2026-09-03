import { useEffect, useState } from 'react';
import { format, subMonths } from 'date-fns';
import { Inbox, ShieldX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchActiveMaster } from '@/lib/masters-cache';
import { useAuth } from '@/contexts/AuthContext';
import { toAmount } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PageHeader, FilterBar, DateRangeField, ActionsMenu, DataTable, EmptyState, InlineNote,
  type DataTableColumn, type DateRange,
} from '@/components/patterns';
import { toast } from '@/lib/toast';
import type { Staff } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 6 — /settlements/log: ONE immutable ledger behind Advances and
// Arrears (Attendo's /loan-arrears-log). Read-only; rows come straight from
// journal_entries (advance payouts, settlement advance adjustments and
// arrears postings) — never a second store.
// ---------------------------------------------------------------------------

interface LogRow {
  id: string;
  staff_id: string | null;
  entry_date: string;
  description: string;
  transaction_type: string;
  amount: number;
  kind: 'Advance' | 'Loan' | 'Arrears';
}

interface Filters {
  outletId: string;
  kind: 'all' | 'advance' | 'loan' | 'arrears';
  range: DateRange;
}

export default function TransactionLog() {
  const { can } = useAuth();
  const canView = can('payouts.execute') || can('settlements.run') || can('ledger.view');

  const [applied, setApplied] = useState<Filters | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [staffById, setStaffById] = useState<Record<string, Staff>>({});
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [mastersLoaded, setMastersLoaded] = useState(false);

  const loadMasters = async () => {
    if (mastersLoaded) return;
    setOutlets(await fetchActiveMaster('outlets').catch(() => []));
    setMastersLoaded(true);
  };

  useEffect(() => { void loadMasters(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async (filters: Filters) => {
    setApplied(filters);
    setLoading(true);
    try {
      const [entriesRes, staffRes] = await Promise.all([
        supabase
          .from('journal_entries')
          .select('id, staff_id, entry_date, description, transaction_type')
          .gte('entry_date', filters.range.from)
          .lte('entry_date', filters.range.to)
          .order('entry_date', { ascending: false })
          .limit(1000),
        supabase.from('staff').select('*'),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      const staffMap: Record<string, Staff> = {};
      for (const s of (staffRes.data ?? []) as Staff[]) staffMap[s.id] = s;
      setStaffById(staffMap);

      type Entry = { id: string; staff_id: string | null; entry_date: string; description: string | null; transaction_type: string };
      const entries = (entriesRes.data ?? []) as unknown as Entry[];

      const classify = (e: Entry): LogRow['kind'] | null => {
        const desc = (e.description ?? '').toLowerCase();
        if (e.transaction_type === 'advance_paid' || e.transaction_type === 'advance_adjustment') return 'Advance';
        if (desc.startsWith('arrears')) return 'Arrears';
        if (desc.includes('loan')) return 'Loan';
        return null;
      };

      const relevant = entries
        .map((e) => ({ e, kind: classify(e) }))
        .filter((x): x is { e: Entry; kind: LogRow['kind'] } => x.kind !== null)
        .filter((x) => filters.kind === 'all' || x.kind.toLowerCase() === filters.kind)
        .filter((x) => {
          if (filters.outletId === 'all') return true;
          const st = x.e.staff_id ? staffMap[x.e.staff_id] : null;
          return (st as { outlet_id?: string | null } | null)?.outlet_id === filters.outletId;
        });

      // Amount = the entry's total debit (fetched per batch of entry ids).
      const ids = relevant.map((x) => x.e.id);
      const amounts = new Map<string, number>();
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data: lines } = await supabase
          .from('journal_lines')
          .select('journal_entry_id, debit')
          .in('journal_entry_id', chunk);
        for (const l of (lines ?? []) as { journal_entry_id: string; debit: number | null }[]) {
          amounts.set(l.journal_entry_id, (amounts.get(l.journal_entry_id) ?? 0) + toAmount(l.debit));
        }
      }

      setRows(relevant.map(({ e, kind }) => ({
        id: e.id,
        staff_id: e.staff_id,
        entry_date: e.entry_date,
        description: e.description ?? '',
        transaction_type: e.transaction_type,
        amount: amounts.get(e.id) ?? 0,
        kind,
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the transaction log');
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return <EmptyState icon={ShieldX} title="Access denied" instruction="The transaction log needs a finance permission — ask an owner." />;
  }

  const columns: DataTableColumn<LogRow>[] = [
    { key: 'emp', header: 'Employee', width: 200, render: (r) => (
      <div>
        <p className="truncate font-medium leading-tight">{r.staff_id ? (staffById[r.staff_id]?.full_name ?? '—') : '—'}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{r.staff_id ? (staffById[r.staff_id]?.employee_id ?? '') : ''}</p>
      </div>
    ) },
    { key: 'date', header: 'Transaction Date', render: (r) => format(new Date(r.entry_date), 'dd MMM yyyy') },
    { key: 'kind', header: 'Type', align: 'center', render: (r) => r.kind },
    { key: 'txn', header: 'Transaction', render: (r) => <span className="block max-w-[26rem] truncate" title={r.description}>{r.description}</span> },
    { key: 'amount', header: 'Amount', align: 'right', bold: true, render: (r) => r.amount.toLocaleString('en-IN') },
  ];

  const initialRange: DateRange = {
    from: format(subMonths(new Date(), 3), 'yyyy-MM-01'),
    to: format(new Date(), 'yyyy-MM-dd'),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transaction Log"
        count={applied ? rows.length : undefined}
        actions={
          <ActionsMenu
            exportConfig={{
              filename: 'settlements-transaction-log',
              title: 'Settlements Transaction Log',
              rows,
              columns: [
                { header: 'Employee', value: (r: LogRow) => (r.staff_id ? staffById[r.staff_id]?.full_name ?? '' : '') },
                { header: 'Date', value: (r: LogRow) => r.entry_date },
                { header: 'Type', value: (r: LogRow) => r.kind },
                { header: 'Transaction', value: (r: LogRow) => r.description },
                { header: 'Amount', value: (r: LogRow) => r.amount },
              ],
            }}
          />
        }
      />

      <div onFocusCapture={loadMasters} onPointerEnter={loadMasters}>
        <FilterBar<Filters>
          initial={{ outletId: 'all', kind: 'all', range: initialRange }}
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
              <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as Filters['kind'] })}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="loan">Loan</SelectItem>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="arrears">Arrears</SelectItem>
                </SelectContent>
              </Select>
              <DateRangeField value={draft.range} onChange={(range) => setDraft({ ...draft, range })} />
            </>
          )}
        </FilterBar>
      </div>

      <InlineNote>Read-only. These rows are the immutable journal entries behind Advances and Arrears.</InlineNote>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        stickyColumns={1}
        loading={loading}
        defaultPageSize={50}
        empty={
          <EmptyState
            icon={Inbox}
            title={applied ? 'No transactions in this period' : 'Nothing loaded yet'}
            instruction={applied ? 'Widen the date range above and press Search again.' : 'Choose a type and date range above and press Search.'}
          />
        }
      />
    </div>
  );
}
