// ============================================================================
// Dynamic Report Builder — pure engine (no IO).
//
// Defines the data-source catalog (columns, types, the permission each source
// requires, and which filter dimensions apply) and the pure transforms that
// turn fetched rows into a previewable / exportable result: filter is pushed to
// the fetch layer; grouping (sum + count), sorting, projection and value
// formatting live here so they are deterministic and unit-tested.
// ============================================================================

export type FieldType = 'text' | 'number' | 'money' | 'date';
export type ReportValue = string | number | null;
export type ReportRow = Record<string, ReportValue>;

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
}

export type SourceKey = 'attendance' | 'salary' | 'expenses' | 'ledger';

export interface SourceDef {
  key: SourceKey;
  label: string;
  /** Permission required to build / run over this source (C.6 enforcement). */
  permission: string;
  /** Date column used for the date-range filter. */
  dateField: string;
  dateGranularity: 'day' | 'month';
  fields: FieldDef[];
  /** Which filter dimensions apply (all four sources resolve staff → dept/branch). */
  dims: { staff: boolean; department: boolean; branch: boolean };
}

export const REPORT_SOURCES: SourceDef[] = [
  {
    key: 'attendance',
    label: 'Attendance',
    permission: 'attendance.view',
    dateField: 'work_date',
    dateGranularity: 'day',
    dims: { staff: true, department: true, branch: true },
    fields: [
      { key: 'work_date', label: 'Date', type: 'date' },
      { key: 'staff_name', label: 'Staff', type: 'text' },
      { key: 'employee_id', label: 'Emp ID', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'check_in', label: 'Check-in', type: 'text' },
      { key: 'check_out', label: 'Check-out', type: 'text' },
      { key: 'worked_hours', label: 'Worked (hrs)', type: 'number' },
      { key: 'source', label: 'Source', type: 'text' },
    ],
  },
  {
    key: 'salary',
    label: 'Salary',
    permission: 'salaries.view',
    dateField: 'settlement_month',
    dateGranularity: 'month',
    dims: { staff: true, department: true, branch: true },
    fields: [
      { key: 'settlement_month', label: 'Month', type: 'text' },
      { key: 'staff_name', label: 'Staff', type: 'text' },
      { key: 'employee_id', label: 'Emp ID', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'base_salary', label: 'Base', type: 'money' },
      { key: 'net_salary', label: 'Gross', type: 'money' },
      { key: 'balance_payable', label: 'Net payable', type: 'money' },
      { key: 'pf_employee', label: 'PF', type: 'money' },
      { key: 'esi_employee', label: 'ESI', type: 'money' },
      { key: 'pt_amount', label: 'PT', type: 'money' },
      { key: 'advances_adjusted', label: 'Advance adj.', type: 'money' },
      { key: 'arrears', label: 'Arrears', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    permission: 'expenses.view',
    dateField: 'expense_date',
    dateGranularity: 'day',
    dims: { staff: true, department: true, branch: true },
    fields: [
      { key: 'expense_date', label: 'Date', type: 'date' },
      { key: 'staff_name', label: 'Staff', type: 'text' },
      { key: 'employee_id', label: 'Emp ID', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
    ],
  },
  {
    key: 'ledger',
    label: 'Ledger',
    permission: 'ledger.view',
    dateField: 'entry_date',
    dateGranularity: 'day',
    dims: { staff: true, department: true, branch: true },
    fields: [
      { key: 'entry_date', label: 'Date', type: 'date' },
      { key: 'voucher_no', label: 'Voucher', type: 'text' },
      { key: 'voucher_type', label: 'Type', type: 'text' },
      { key: 'staff_name', label: 'Staff', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'debit', label: 'Debit', type: 'money' },
      { key: 'credit', label: 'Credit', type: 'money' },
      { key: 'running_balance', label: 'Balance', type: 'money' },
      { key: 'payment_mode', label: 'Mode', type: 'text' },
      { key: 'tag', label: 'Tag', type: 'text' },
    ],
  },
];

export function getSource(key: SourceKey): SourceDef {
  const s = REPORT_SOURCES.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown report source: ${key}`);
  return s;
}

export interface ReportFilters {
  from: string; // yyyy-MM-dd
  to: string;   // yyyy-MM-dd
  staffId?: string;     // '' / undefined => all
  department?: string;  // '' / undefined => all
  branch?: string;      // '' / undefined => all
}

export interface ReportSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface ReportDefinition {
  source: SourceKey;
  columns: string[]; // ordered field keys
  filters: ReportFilters;
  groupBy?: string | null;
  sort?: ReportSort | null;
}

/** A persisted report definition (the `saved_reports` row, definition parsed). */
export interface SavedReport {
  id: string;
  name: string;
  source: SourceKey;
  definition: ReportDefinition;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OutputType = FieldType | 'count';
export interface OutputColumn {
  key: string;
  label: string;
  type: OutputType;
}
export interface ComputedReport {
  columns: OutputColumn[];
  rows: ReportRow[];
}

const COUNT_KEY = '__count';

/** Stable sort of rows by a single column (numbers numeric, nulls last). */
export function sortRows(rows: ReportRow[], sort: ReportSort | null | undefined): ReportRow[] {
  if (!sort) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[sort.field];
    const vb = b[sort.field];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
  });
}

/**
 * Project the selected columns, optionally grouping. When grouped, one row per
 * distinct group value: numeric/money columns are summed, other columns blanked,
 * and a trailing Count column is appended. Sort (if any) is applied last.
 */
export function computeReport(rows: ReportRow[], def: ReportDefinition): ComputedReport {
  const source = getSource(def.source);
  const selected = def.columns
    .map((k) => source.fields.find((f) => f.key === k))
    .filter((f): f is FieldDef => !!f);

  let outRows: ReportRow[];
  let columns: OutputColumn[] = selected.map((f) => ({ key: f.key, label: f.label, type: f.type }));

  if (def.groupBy) {
    const groupKey = def.groupBy;
    const groups = new Map<string, ReportRow[]>();
    for (const r of rows) {
      const k = String(r[groupKey] ?? '');
      const bucket = groups.get(k);
      if (bucket) bucket.push(r);
      else groups.set(k, [r]);
    }
    outRows = [...groups.values()].map((groupRows) => {
      const out: ReportRow = {};
      for (const f of selected) {
        if (f.key === groupKey) {
          out[f.key] = groupRows[0][groupKey] ?? null;
        } else if (f.type === 'money' || f.type === 'number') {
          out[f.key] = groupRows.reduce((sum, x) => sum + (Number(x[f.key]) || 0), 0);
        } else {
          out[f.key] = null;
        }
      }
      out[COUNT_KEY] = groupRows.length;
      return out;
    });
    columns = [...columns, { key: COUNT_KEY, label: 'Count', type: 'count' }];
  } else {
    outRows = rows.map((r) => {
      const out: ReportRow = {};
      for (const f of selected) out[f.key] = r[f.key] ?? null;
      return out;
    });
  }

  return { columns, rows: sortRows(outRows, def.sort) };
}

/** Display string for a value of the given type (— for empty). */
export function formatDisplay(value: ReportValue, type: OutputType): string {
  if (value == null || value === '') return '—';
  if (type === 'money') return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  if (type === 'number' || type === 'count') return Number(value).toLocaleString('en-IN');
  return String(value);
}

/** Value used for spreadsheet/PDF export — numbers stay numeric. */
export function toExportValue(value: ReportValue, type: OutputType): string | number {
  if (value == null) return '';
  if (type === 'money' || type === 'number' || type === 'count') return Number(value) || 0;
  return String(value);
}

/** Headers + row matrix for Excel/PDF export, aligned to the computed columns. */
export function buildExportMatrix(report: ComputedReport): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: report.columns.map((c) => c.label),
    rows: report.rows.map((r) => report.columns.map((c) => toExportValue(r[c.key], c.type))),
  };
}

export const isNumericType = (t: OutputType): boolean => t === 'money' || t === 'number' || t === 'count';
