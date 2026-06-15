// ============================================================================
// Report Builder — data fetch layer (IO).
//
// Fetches the raw rows for a chosen source and flattens them into the engine's
// ReportRow shape. The date range is pushed to SQL; the staff filter uses an
// indexed eq; department/branch are resolved from a staff lookup and filtered in
// memory. Every source table already enforces its own RLS, so a user only ever
// receives rows they are permitted to see (defence in depth alongside the
// builder's permission gate).
// ============================================================================

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { getSource, type ReportRow, type ReportFilters, type SourceKey } from './report-builder';

interface StaffMeta { name: string; empId: string; dept: string; branch: string }
const EMPTY_META: StaffMeta = { name: '', empId: '', dept: '', branch: '' };

async function loadStaffMeta(): Promise<Map<string, StaffMeta>> {
  const [{ data: staff }, { data: outlets }] = await Promise.all([
    supabase.from('staff').select('id, full_name, employee_id, department, outlet_id'),
    supabase.from('outlets').select('id, name'),
  ]);
  const outletName = new Map<string, string>((outlets ?? []).map((o) => [o.id, o.name]));
  const map = new Map<string, StaffMeta>();
  for (const s of staff ?? []) {
    map.set(s.id, {
      name: s.full_name ?? '',
      empId: s.employee_id ?? '',
      dept: s.department ?? '',
      branch: s.outlet_id ? (outletName.get(s.outlet_id) ?? '') : '',
    });
  }
  return map;
}

const safeTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'HH:mm');
};

/** Fetch + flatten the rows for a source, honouring the filters. */
export async function fetchReportRows(sourceKey: SourceKey, filters: ReportFilters): Promise<ReportRow[]> {
  const src = getSource(sourceKey);
  const staffMeta = await loadStaffMeta();
  const meta = (id: string | null): StaffMeta => (id ? staffMeta.get(id) ?? EMPTY_META : EMPTY_META);

  let rows: ReportRow[] = [];

  if (sourceKey === 'attendance') {
    let q = supabase
      .from('attendance_sessions')
      .select('work_date, staff_id, status, check_in_at, check_out_at, worked_minutes, source')
      .gte('work_date', filters.from)
      .lte('work_date', filters.to);
    if (filters.staffId) q = q.eq('staff_id', filters.staffId);
    const { data, error } = await q.order('work_date', { ascending: false });
    if (error) throw error;
    rows = (data ?? []).map((r) => {
      const m = meta(r.staff_id);
      return {
        work_date: r.work_date,
        staff_name: m.name, employee_id: m.empId, department: m.dept, branch: m.branch,
        status: r.status,
        check_in: safeTime(r.check_in_at), check_out: safeTime(r.check_out_at),
        worked_hours: r.worked_minutes != null ? Math.round((r.worked_minutes / 60) * 100) / 100 : null,
        source: r.source,
      } as ReportRow;
    });
  } else if (sourceKey === 'salary') {
    let q = supabase
      .from('salary_settlements')
      .select('settlement_month, staff_id, base_salary, net_salary, balance_payable, pf_employee, esi_employee, pt_amount, advances_adjusted, arrears, status')
      .gte('settlement_month', filters.from.slice(0, 7))
      .lte('settlement_month', filters.to.slice(0, 7));
    if (filters.staffId) q = q.eq('staff_id', filters.staffId);
    const { data, error } = await q.order('settlement_month', { ascending: false });
    if (error) throw error;
    rows = (data ?? []).map((r) => {
      const m = meta(r.staff_id);
      return {
        settlement_month: r.settlement_month,
        staff_name: m.name, employee_id: m.empId, department: m.dept, branch: m.branch,
        base_salary: r.base_salary, net_salary: r.net_salary, balance_payable: r.balance_payable,
        pf_employee: r.pf_employee, esi_employee: r.esi_employee, pt_amount: r.pt_amount,
        advances_adjusted: r.advances_adjusted ?? 0, arrears: r.arrears ?? 0, status: r.status ?? '',
      } as ReportRow;
    });
  } else if (sourceKey === 'expenses') {
    let q = supabase
      .from('expenses')
      .select('expense_date, staff_id, category, amount, status, description')
      .gte('expense_date', filters.from)
      .lte('expense_date', filters.to)
      .neq('status', 'draft');
    if (filters.staffId) q = q.eq('staff_id', filters.staffId);
    const { data, error } = await q.order('expense_date', { ascending: false });
    if (error) throw error;
    rows = (data ?? []).map((r) => {
      const m = meta(r.staff_id);
      return {
        expense_date: r.expense_date,
        staff_name: m.name, employee_id: m.empId, department: m.dept, branch: m.branch,
        category: r.category, amount: r.amount, status: r.status, description: r.description,
      } as ReportRow;
    });
  } else {
    let q = supabase
      .from('ledger_entries')
      .select('entry_date, staff_id, voucher_no, voucher_type, description, debit, credit, running_balance, payment_mode, tag')
      .gte('entry_date', filters.from)
      .lte('entry_date', filters.to);
    if (filters.staffId) q = q.eq('staff_id', filters.staffId);
    const { data, error } = await q.order('entry_date', { ascending: false });
    if (error) throw error;
    rows = (data ?? []).map((r) => {
      const m = meta(r.staff_id);
      return {
        entry_date: r.entry_date, voucher_no: r.voucher_no, voucher_type: r.voucher_type,
        staff_name: m.name, department: m.dept, branch: m.branch, description: r.description,
        debit: r.debit ?? 0, credit: r.credit ?? 0, running_balance: r.running_balance ?? null,
        payment_mode: r.payment_mode ?? '', tag: r.tag ?? '',
      } as ReportRow;
    });
  }

  // In-memory dimension filters resolved from the staff lookup.
  return rows.filter((row) => {
    if (filters.department && src.dims.department && row.department !== filters.department) return false;
    if (filters.branch && src.dims.branch && row.branch !== filters.branch) return false;
    return true;
  });
}

export interface ReportFilterOptions {
  staff: { id: string; name: string }[];
  departments: string[];
  branches: string[];
}

/** Lists that populate the builder's staff / department / branch filter dropdowns. */
export async function loadReportFilterOptions(): Promise<ReportFilterOptions> {
  const [{ data: staff }, { data: depts }, { data: outlets }] = await Promise.all([
    supabase.from('staff').select('id, full_name').order('full_name'),
    supabase.from('departments').select('name').eq('is_active', true).order('name'),
    supabase.from('outlets').select('name').eq('is_active', true).order('name'),
  ]);
  return {
    staff: (staff ?? []).map((s) => ({ id: s.id, name: s.full_name ?? '' })),
    departments: (depts ?? []).map((d) => d.name),
    branches: (outlets ?? []).map((o) => o.name),
  };
}
