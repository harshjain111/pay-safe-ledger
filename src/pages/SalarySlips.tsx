import { useEffect, useState } from 'react';
import { format, parseISO, subMonths } from 'date-fns';
import { Download, FileText, Inbox, Loader2, ShieldX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchActiveMaster } from '@/lib/masters-cache';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PageHeader, FilterBar, ActionsMenu, DataTable, EmptyState, InlineNote,
  type DataTableColumn,
} from '@/components/patterns';
import { toast } from '@/lib/toast';
import { toAmount } from '@/lib/utils';
import {
  downloadBulkPayslipsPDF, downloadPayslipPDF,
  type PayslipSettlement, type PayslipStaff,
} from '@/lib/payslip-pdf';
import { fetchPayslipExtras, orgToPayslipOrg } from '@/lib/payslip-extras';
import type { Staff } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 5C — the HR/Admin surface: any employee, any FINALIZED month, single
// and bulk multi-page download. Gated on payslips.download (HR built-in; the
// Phase 5 migration adds it to Administrator). The sheet lock control lives
// on Process Payroll, not here.
// ---------------------------------------------------------------------------

type SlipRow = PayslipSettlement & { id: string; staff_id: string };
interface Filters { outletId: string; month: string }

export default function SalarySlips() {
  const { can } = useAuth();
  const { data: org } = useOrganizationProfile();

  const [applied, setApplied] = useState<Filters | null>(null);
  const [rows, setRows] = useState<SlipRow[]>([]);
  const [staffById, setStaffById] = useState<Record<string, Staff>>({});
  const [finalized, setFinalized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [mastersLoaded, setMastersLoaded] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const canDownload = can('payslips.download');

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
      const [setRes, staffRes, lockRes] = await Promise.all([
        supabase.from('salary_settlements').select('*').eq('settlement_month', filters.month),
        supabase.from('staff').select('*'),
        supabase.from('salary_sheet_locks' as never).select('month').eq('month', filters.month).maybeSingle(),
      ]);
      if (setRes.error) throw setRes.error;

      const staffMap: Record<string, Staff> = {};
      for (const s of (staffRes.data ?? []) as Staff[]) staffMap[s.id] = s;
      setStaffById(staffMap);
      setFinalized(!lockRes.error && !!lockRes.data);

      let slips = (setRes.data ?? []) as unknown as SlipRow[];
      if (filters.outletId !== 'all') {
        slips = slips.filter((r) => (staffMap[r.staff_id] as { outlet_id?: string | null } | undefined)?.outlet_id === filters.outletId);
      }
      slips.sort((a, b) => (staffMap[a.staff_id]?.full_name ?? '').localeCompare(staffMap[b.staff_id]?.full_name ?? ''));
      setRows(slips);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load salary slips');
    } finally {
      setLoading(false);
    }
  };

  if (!canDownload) {
    return (
      <EmptyState
        icon={ShieldX}
        title="Access denied"
        instruction="Salary slips need the 'Download all payslips' permission — ask an owner to grant it."
      />
    );
  }

  const slipStaff = (r: SlipRow) => staffById[r.staff_id] as unknown as PayslipStaff | undefined;

  const downloadOne = async (r: SlipRow) => {
    const staff = slipStaff(r);
    if (!staff) { toast.error('Staff record not found for this slip'); return; }
    setDownloading(r.id);
    try {
      const extras = (await fetchPayslipExtras([r.staff_id])).get(r.staff_id);
      await downloadPayslipPDF(staff, r, orgToPayslipOrg(org as never), extras);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate the slip');
    } finally {
      setDownloading(null);
    }
  };

  const downloadAll = async () => {
    if (!applied || rows.length === 0) return;
    setBulkBusy(true);
    try {
      const extrasMap = await fetchPayslipExtras(rows.map((r) => r.staff_id));
      const items = rows
        .map((r) => ({ staff: slipStaff(r), settlement: r, extras: extrasMap.get(r.staff_id) }))
        .filter((i): i is { staff: PayslipStaff; settlement: SlipRow; extras: undefined | NonNullable<ReturnType<typeof extrasMap.get>> } => !!i.staff);
      await downloadBulkPayslipsPDF(applied.month, items, orgToPayslipOrg(org as never));
      toast.success(`Generated one PDF with ${items.length} payslip${items.length === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate the bulk PDF');
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: DataTableColumn<SlipRow>[] = [
    { key: 'emp', header: 'Employee', width: 210, render: (r) => (
      <div>
        <p className="truncate font-medium leading-tight">{staffById[r.staff_id]?.full_name ?? '—'}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{staffById[r.staff_id]?.employee_id ?? ''}</p>
      </div>
    ) },
    { key: 'earned', header: 'Earned', align: 'right', render: (r) => toAmount(r.net_salary).toLocaleString('en-IN') },
    { key: 'net', header: 'Net Payable', align: 'right', bold: true, render: (r) => toAmount(r.balance_payable).toLocaleString('en-IN') },
    { key: 'settled', header: 'Settled On', render: (r) => (r.settled_at ? format(new Date(r.settled_at), 'dd MMM yyyy') : '—') },
    { key: 'status', header: 'Status', align: 'center', render: (r) => (r.paid_at ? <Badge>Paid</Badge> : <Badge variant="secondary">Settled</Badge>) },
    {
      key: 'dl', header: '', align: 'center',
      render: (r) => (
        <Button size="sm" variant="outline" className="gap-1.5" disabled={downloading === r.id || bulkBusy} onClick={() => downloadOne(r)}>
          {downloading === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Slip
        </Button>
      ),
    },
  ];

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Salary Slips"
        count={applied ? rows.length : undefined}
        actions={
          <>
            <ActionsMenu
              exportConfig={{
                filename: `salary-slips-${applied?.month ?? ''}`,
                title: `Salary Slips — ${applied ? format(parseISO(applied.month + '-01'), 'MMMM yyyy') : ''}`,
                rows,
                columns: [
                  { header: 'Employee', value: (r: SlipRow) => staffById[r.staff_id]?.full_name ?? '' },
                  { header: 'Code', value: (r: SlipRow) => staffById[r.staff_id]?.employee_id ?? '' },
                  { header: 'Earned', value: (r: SlipRow) => toAmount(r.net_salary) },
                  { header: 'Net Payable', value: (r: SlipRow) => toAmount(r.balance_payable) },
                  { header: 'Paid', value: (r: SlipRow) => (r.paid_at ? 'Yes' : 'No') },
                ],
              }}
            />
            <Button className="gap-1.5" disabled={rows.length === 0 || bulkBusy} onClick={downloadAll}>
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download all
            </Button>
          </>
        }
      />

      <div onFocusCapture={loadMasters} onPointerEnter={loadMasters}>
        <FilterBar<Filters>
          initial={{ outletId: 'all', month: format(subMonths(new Date(), 1), 'yyyy-MM') }}
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
              <Select value={draft.month} onValueChange={(v) => setDraft({ ...draft, month: v })}>
                <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </FilterBar>
      </div>

      {applied && !finalized && rows.length > 0 && (
        <InlineNote>
          This month's salary sheet is not locked yet — these slips are settled but not finalized. Employees only see
          a month once it is locked or paid.
        </InlineNote>
      )}

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
            title={applied ? 'No settled slips this month' : 'Nothing loaded yet'}
            instruction={applied ? 'Slips appear once salaries are finalized on Process Payroll for this month.' : 'Choose an outlet and month above and press Search.'}
          />
        }
      />
    </div>
  );
}
