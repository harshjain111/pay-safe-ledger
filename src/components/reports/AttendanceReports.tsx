import { useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import {
  CalendarRange, Clock, Timer, Layers, Building2, CalendarDays,
  FileSpreadsheet, FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilterBar } from '@/components/layout/filter-bar';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState } from '@/components/layout/ErrorState';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/lib/toast';
import { useAttendanceReportData, type ReportFilterState } from '@/hooks/useAttendanceReportData';
import {
  musterRows, dailyPunchRows, workingHoursRows, shiftWiseRows, branchWiseRows, employeeDayWiseRows,
  formatHM, type AttendanceReportDataset, type MusterRow,
} from '@/lib/attendance-reports';
import { exportSheetsToExcel, exportTableToPDF } from '@/lib/report-export';

type ReportKey = 'muster' | 'daily_punch' | 'working_hours' | 'shift_wise' | 'branch_wise' | 'day_wise';

const REPORTS: { key: ReportKey; label: string; short: string; icon: typeof Clock }[] = [
  { key: 'muster', label: 'Muster Roll', short: 'Muster', icon: CalendarRange },
  { key: 'daily_punch', label: 'Daily Punch', short: 'Punches', icon: Clock },
  { key: 'working_hours', label: 'Working Hours', short: 'Hours', icon: Timer },
  { key: 'shift_wise', label: 'Shift-Wise', short: 'Shifts', icon: Layers },
  { key: 'branch_wise', label: 'Branch-Wise Punch', short: 'Branch', icon: Building2 },
  { key: 'day_wise', label: 'Employee Day-Wise', short: 'Day-Wise', icon: CalendarDays },
];

const EMPTY_DATASET: AttendanceReportDataset = {
  from: '', to: '', dates: [], staffReports: [], shiftsById: new Map(), outletNameById: new Map(), sessions: [],
};

// ---- formatters ------------------------------------------------------------
const fmtDate = (d: string) => format(parseISO(d), 'dd-MM-yyyy');
const fmtDay = (d: string) => format(parseISO(d), 'EEE');
const fmtTime = (iso: string | null) => (iso ? format(parseISO(iso), 'hh:mm a') : '—');
const fmtMin = (m: number | null | undefined) => (m == null ? '—' : formatHM(m));

// ---- muster-roll cell ------------------------------------------------------
const MARK_STYLE: Record<string, string> = {
  P: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  HD: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  L: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  WO: 'bg-muted text-muted-foreground',
  H: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  A: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};
function MarkBadge({ mark }: { mark: string }) {
  if (!mark) return <span className="text-muted-foreground/40">·</span>;
  return (
    <span className={cn('inline-flex min-w-[1.7rem] justify-center rounded px-1 py-0.5 text-[10px] font-semibold', MARK_STYLE[mark] ?? 'bg-muted text-muted-foreground')}>
      {mark}
    </span>
  );
}

// A unified column spec that produces BOTH the on-screen DataTable column and
// the export value, so the Excel/PDF export always matches the screen.
interface Spec<T> {
  id: string;
  header: string;
  value: (r: T) => string | number;
  render?: (r: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  sortValue?: (r: T) => string | number;
}
function specToColumns<T>(specs: Spec<T>[]): DataTableColumn<T>[] {
  return specs.map((s) => ({
    id: s.id,
    header: s.header,
    cell: (r) => (s.render ? s.render(r) : s.value(r)),
    align: s.align,
    sortable: s.sortable,
    sortAccessor: s.sortable ? (s.sortValue ?? ((r) => s.value(r))) : undefined,
  }));
}

interface ReportView {
  columns: DataTableColumn<unknown>[];
  data: unknown[];
  rowKey: (r: unknown) => string;
  exportHeaders: string[];
  exportRows: (string | number)[][];
  searchText: (r: unknown) => string;
  title: string;
  filenameBase: string;
  density?: 'compact';
  legend?: boolean;
}

/** Build the active report's columns + rows + export payload from the dataset. */
function buildView(report: ReportKey, ds: AttendanceReportDataset): ReportView {
  // Cast helper — each branch knows its own row type; the container is generic.
  const view = <T,>(v: {
    specs?: Spec<T>[];
    columns?: DataTableColumn<T>[];
    data: T[];
    rowKey: (r: T) => string;
    exportHeaders: string[];
    exportRows: (string | number)[][];
    searchText: (r: T) => string;
    title: string;
    filenameBase: string;
    density?: 'compact';
    legend?: boolean;
  }): ReportView => ({
    columns: (v.columns ?? specToColumns(v.specs ?? [])) as DataTableColumn<unknown>[],
    data: v.data as unknown[],
    rowKey: v.rowKey as (r: unknown) => string,
    exportHeaders: v.exportHeaders,
    exportRows: v.exportRows,
    searchText: v.searchText as (r: unknown) => string,
    title: v.title,
    filenameBase: v.filenameBase,
    density: v.density,
    legend: v.legend,
  });

  if (report === 'muster') {
    const rows = musterRows(ds);
    const dayCols: DataTableColumn<MusterRow>[] = ds.dates.map((d, i) => ({
      id: `d${d}`,
      header: format(parseISO(d), 'dd'),
      align: 'center',
      headerClassName: 'px-1',
      cellClassName: 'px-1',
      cell: (r) => <MarkBadge mark={r.cells[i]} />,
    }));
    const columns: DataTableColumn<MusterRow>[] = [
      { id: 'emp', header: 'Emp ID', cell: (r) => r.staff.employee_id, sortable: true, sortAccessor: (r) => r.staff.employee_id },
      { id: 'name', header: 'Name', cell: (r) => <span className="whitespace-nowrap font-medium">{r.staff.full_name}</span>, sortable: true, sortAccessor: (r) => r.staff.full_name },
      ...dayCols,
      { id: 'p', header: 'Present', align: 'right', cell: (r) => r.presentEquiv, sortable: true, sortAccessor: (r) => r.presentEquiv },
      { id: 'l', header: 'Leave', align: 'right', cell: (r) => r.leave },
      { id: 'o', header: 'Off', align: 'right', cell: (r) => r.off },
      { id: 'a', header: 'Absent', align: 'right', cell: (r) => r.absent, sortable: true, sortAccessor: (r) => r.absent },
      { id: 'paid', header: 'Paid', align: 'right', cell: (r) => <span className="font-semibold tabular-nums">{r.paidDays}</span>, sortable: true, sortAccessor: (r) => r.paidDays },
    ];
    return view<MusterRow>({
      columns,
      data: rows,
      rowKey: (r) => r.staff.id,
      exportHeaders: ['Emp ID', 'Name', ...ds.dates.map((d) => format(parseISO(d), 'dd')), 'Present', 'Leave', 'Off', 'Absent', 'Paid Days'],
      exportRows: rows.map((r) => [r.staff.employee_id, r.staff.full_name, ...r.cells, r.presentEquiv, r.leave, r.off, r.absent, r.paidDays]),
      searchText: (r) => `${r.staff.full_name} ${r.staff.employee_id}`,
      title: 'Muster Roll',
      filenameBase: 'Muster_Roll',
      density: 'compact',
      legend: true,
    });
  }

  if (report === 'daily_punch') {
    const rows = dailyPunchRows(ds);
    const specs: Spec<(typeof rows)[number]>[] = [
      { id: 'emp', header: 'Emp ID', value: (r) => r.staff.employee_id, sortable: true },
      { id: 'name', header: 'Name', value: (r) => r.staff.full_name, sortable: true },
      { id: 'dept', header: 'Department', value: (r) => r.staff.department ?? '' },
      { id: 'date', header: 'Date', value: (r) => fmtDate(r.date), sortable: true, sortValue: (r) => r.date },
      { id: 'day', header: 'Day', value: (r) => fmtDay(r.date) },
      { id: 'in', header: 'In', value: (r) => fmtTime(r.checkIn) },
      { id: 'out', header: 'Out', value: (r) => fmtTime(r.checkOut) },
      { id: 'method', header: 'Method', value: (r) => r.method, render: (r) => <span className="capitalize">{r.method}</span> },
      { id: 'worked', header: 'Worked', value: (r) => fmtMin(r.workedMinutes), align: 'right' },
      { id: 'status', header: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    ];
    return view({
      specs, data: rows,
      rowKey: (r) => `${r.staff.id}|${r.date}|${r.checkIn ?? ''}|${r.checkOut ?? ''}`,
      exportHeaders: specs.map((s) => s.header),
      exportRows: rows.map((r) => specs.map((s) => s.value(r))),
      searchText: (r) => `${r.staff.full_name} ${r.staff.employee_id}`,
      title: 'Daily Punch Report', filenameBase: 'Daily_Punch_Report', density: 'compact',
    });
  }

  if (report === 'working_hours') {
    const rows = workingHoursRows(ds);
    const specs: Spec<(typeof rows)[number]>[] = [
      { id: 'emp', header: 'Emp ID', value: (r) => r.staff.employee_id, sortable: true },
      { id: 'name', header: 'Name', value: (r) => r.staff.full_name, sortable: true },
      { id: 'dept', header: 'Department', value: (r) => r.staff.department ?? '' },
      { id: 'worked', header: 'Worked (h:m)', value: (r) => formatHM(r.workedMinutes), align: 'right', sortable: true, sortValue: (r) => r.workedMinutes },
      { id: 'sched', header: 'Scheduled (h:m)', value: (r) => formatHM(r.scheduledMinutes), align: 'right' },
      { id: 'ot', header: 'Overtime (min)', value: (r) => r.overtimeMinutes, align: 'right', sortable: true, sortValue: (r) => r.overtimeMinutes },
      { id: 'present', header: 'Present Days', value: (r) => r.presentDays, align: 'right' },
    ];
    return view({
      specs, data: rows, rowKey: (r) => r.staff.id,
      exportHeaders: specs.map((s) => s.header),
      exportRows: rows.map((r) => specs.map((s) => s.value(r))),
      searchText: (r) => `${r.staff.full_name} ${r.staff.employee_id}`,
      title: 'Working Hours Report', filenameBase: 'Working_Hours_Report',
    });
  }

  if (report === 'shift_wise') {
    const rows = shiftWiseRows(ds);
    const specs: Spec<(typeof rows)[number]>[] = [
      { id: 'shift', header: 'Shift', value: (r) => r.shiftName, sortable: true },
      { id: 'timing', header: 'Timing', value: (r) => r.timing },
      { id: 'staff', header: 'Staff', value: (r) => r.staffCount, align: 'right' },
      { id: 'present', header: 'Present', value: (r) => r.present, align: 'right', sortable: true, sortValue: (r) => r.present },
      { id: 'half', header: 'Half', value: (r) => r.half, align: 'right' },
      { id: 'absent', header: 'Absent', value: (r) => r.absent, align: 'right' },
      { id: 'off', header: 'Off', value: (r) => r.off, align: 'right' },
    ];
    return view({
      specs, data: rows, rowKey: (r) => r.shiftId ?? 'none',
      exportHeaders: specs.map((s) => s.header),
      exportRows: rows.map((r) => specs.map((s) => s.value(r))),
      searchText: (r) => r.shiftName,
      title: 'Shift-Wise Report', filenameBase: 'Shift_Wise_Report',
    });
  }

  if (report === 'branch_wise') {
    const rows = branchWiseRows(ds);
    const specs: Spec<(typeof rows)[number]>[] = [
      { id: 'branch', header: 'Branch', value: (r) => r.branch, sortable: true },
      { id: 'staff', header: 'Staff', value: (r) => r.staffCount, align: 'right' },
      { id: 'punches', header: 'Punches', value: (r) => r.punches, align: 'right', sortable: true, sortValue: (r) => r.punches },
      { id: 'present', header: 'Present', value: (r) => r.present, align: 'right' },
      { id: 'absent', header: 'Absent', value: (r) => r.absent, align: 'right' },
    ];
    return view({
      specs, data: rows, rowKey: (r) => r.outletId ?? 'none',
      exportHeaders: specs.map((s) => s.header),
      exportRows: rows.map((r) => specs.map((s) => s.value(r))),
      searchText: (r) => r.branch,
      title: 'Branch-Wise Punch Report', filenameBase: 'Branch_Wise_Punch_Report',
    });
  }

  // day_wise
  const rows = employeeDayWiseRows(ds);
  const specs: Spec<(typeof rows)[number]>[] = [
    { id: 'emp', header: 'Emp ID', value: (r) => r.staff.employee_id, sortable: true },
    { id: 'name', header: 'Name', value: (r) => r.staff.full_name, sortable: true },
    { id: 'dept', header: 'Department', value: (r) => r.staff.department ?? '' },
    { id: 'date', header: 'Date', value: (r) => fmtDate(r.date), sortable: true, sortValue: (r) => r.date },
    { id: 'day', header: 'Day', value: (r) => fmtDay(r.date) },
    { id: 'status', header: 'Status', value: (r) => r.mark, render: (r) => <MarkBadge mark={r.mark} /> },
    { id: 'worked', header: 'Worked', value: (r) => fmtMin(r.workedMinutes), align: 'right' },
    { id: 'sched', header: 'Scheduled', value: (r) => fmtMin(r.scheduledMinutes), align: 'right' },
    { id: 'shift', header: 'Shift', value: (r) => r.shiftName },
    { id: 'in', header: 'In', value: (r) => fmtTime(r.checkIn) },
    { id: 'out', header: 'Out', value: (r) => fmtTime(r.checkOut) },
  ];
  return view({
    specs, data: rows, rowKey: (r) => `${r.staff.id}|${r.date}`,
    exportHeaders: specs.map((s) => s.header),
    exportRows: rows.map((r) => specs.map((s) => s.value(r))),
    searchText: (r) => `${r.staff.full_name} ${r.staff.employee_id}`,
    title: 'Employee Day-Wise Master', filenameBase: 'Employee_Day_Wise_Master', density: 'compact', legend: true,
  });
}

export function AttendanceReports() {
  const [report, setReport] = useState<ReportKey>('muster');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ReportFilterState>({
    from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    outletId: 'all',
    departmentId: 'all',
    staffId: 'all',
  });

  const { dataset, loading, error, reload, outlets, departments, staffList } = useAttendanceReportData(filters);

  const view = useMemo(() => buildView(report, dataset ?? EMPTY_DATASET), [report, dataset]);

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return view.data;
    return view.data.filter((r) => view.searchText(r).toLowerCase().includes(q));
  }, [view, search]);

  const set = (patch: Partial<ReportFilterState>) => setFilters((f) => ({ ...f, ...patch }));

  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (filters.outletId !== 'all') parts.push(`Branch: ${outlets.find((o) => o.id === filters.outletId)?.name ?? ''}`);
    if (filters.departmentId !== 'all') parts.push(`Dept: ${departments.find((d) => d.id === filters.departmentId)?.name ?? ''}`);
    if (filters.staffId !== 'all') parts.push(`Staff: ${staffList.find((s) => s.id === filters.staffId)?.full_name ?? ''}`);
    return parts.length ? parts.join('  •  ') : 'All branches & departments';
  }, [filters, outlets, departments, staffList]);

  const hasData = view.exportRows.length > 0;

  const handleExcel = async () => {
    if (!hasData) return;
    await exportSheetsToExcel(`${view.filenameBase}_${filters.from}_to_${filters.to}`, [
      { name: view.title, headers: view.exportHeaders, rows: view.exportRows },
    ]);
    toast.success('Excel exported');
  };
  const handlePDF = async () => {
    if (!hasData) return;
    await exportTableToPDF({
      title: view.title,
      subtitle,
      filename: view.filenameBase,
      headers: view.exportHeaders,
      rows: view.exportRows,
      dateRange: { from: parseISO(filters.from), to: parseISO(filters.to) },
    });
    toast.success('PDF exported');
  };

  return (
    <div className="space-y-4">
      {/* Report selector */}
      <Tabs value={report} onValueChange={(v) => setReport(v as ReportKey)}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-max gap-1 sm:grid sm:w-full sm:grid-cols-6">
            {REPORTS.map((r) => (
              <TabsTrigger key={r.key} value={r.key} className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                <r.icon className="h-4 w-4" />
                <span className="text-xs sm:text-sm">{r.short}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Filters + export */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search staff / shift / branch…"
        filters={
          <>
            <div className="flex items-end gap-1.5">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
                <Input type="date" value={filters.from} max={filters.to} onChange={(e) => set({ from: e.target.value })} className="h-9 w-[9.5rem]" aria-label="From date" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
                <Input type="date" value={filters.to} min={filters.from} onChange={(e) => set({ to: e.target.value })} className="h-9 w-[9.5rem]" aria-label="To date" />
              </div>
            </div>
            <Select value={filters.outletId} onValueChange={(v) => set({ outletId: v })}>
              <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Branch"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All branches</SelectItem>
                {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.departmentId} onValueChange={(v) => set({ departmentId: v })}>
              <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Department"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.staffId} onValueChange={(v) => set({ staffId: v })}>
              <SelectTrigger className="h-9 w-[10rem]" aria-label="Staff"><SelectValue placeholder="Staff" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All staff</SelectItem>
                {staffList.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExcel} disabled={!hasData} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /><span className="hidden sm:inline">Excel</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handlePDF} disabled={!hasData} className="gap-1.5">
              <FileDown className="h-4 w-4" /><span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        }
      />

      {view.legend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Legend:</span>
          <span className="inline-flex items-center gap-1"><MarkBadge mark="P" /> Present</span>
          <span className="inline-flex items-center gap-1"><MarkBadge mark="HD" /> Half day</span>
          <span className="inline-flex items-center gap-1"><MarkBadge mark="L" /> Leave</span>
          <span className="inline-flex items-center gap-1"><MarkBadge mark="WO" /> Weekly off</span>
          <span className="inline-flex items-center gap-1"><MarkBadge mark="H" /> Holiday</span>
          <span className="inline-flex items-center gap-1"><MarkBadge mark="A" /> Absent</span>
        </div>
      )}

      {error ? (
        <ErrorState title="Couldn't load attendance data" description={error} onRetry={reload} className="py-12" />
      ) : (
        <DataTable
          columns={view.columns}
          data={filteredData}
          rowKey={view.rowKey}
          isLoading={loading}
          density={view.density}
          pageSize={report === 'muster' || report === 'day_wise' ? 25 : 10}
          className="overflow-hidden"
        />
      )}

      <p className="text-[11px] text-muted-foreground">
        Derived from attendance punches &amp; roster — Muster Roll “Paid” days reconcile with salary settlements.
      </p>
    </div>
  );
}

export default AttendanceReports;
