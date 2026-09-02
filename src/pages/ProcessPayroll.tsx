import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, getDaysInMonth, parseISO, subMonths } from 'date-fns';
import {
  Calculator, Eye, FileText, Inbox, Lock, LockOpen, Pencil, User, Wallet,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { toAmount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Amount } from '@/components/ui/amount';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  PageHeader, FilterBar, DateRangeField, ActionsMenu, DataTable, Drawer,
  ConfigurableHeader, RowMenu, EmptyState, InlineNote,
  type DataTableColumn, type DateRange,
} from '@/components/patterns';
import { PayrollDataIntegrityBanner } from '@/components/payroll/PayrollDataIntegrityBanner';
import { RulesDrawer, type RuleField } from '@/components/payroll/RulesDrawer';
import { toast } from '@/lib/toast';
import { downloadPayslipPDF, type PayslipSettlement } from '@/lib/payslip-pdf';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import {
  computeSettlement, gatherSettlementInputs, isMonthSettled, persistGroupSettlement,
  type SettlementInputs, type SettlementResult,
} from '@/lib/settlement-engine';
import type { Staff } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 3B — Process Payroll: pick a scope, pick a period, press Search, read
// one grid, press Finalize. Replaces /salaries-advances tiles, the per-staff
// navigation loop and PayrollGroups' Batch Settle. Every number comes from
// settlement-engine.ts; there are NO override fields on this grid — the one
// escape hatch is the audited Adjust drawer (a pending arrears line).
// ---------------------------------------------------------------------------

interface StoredSettlement {
  id: string;
  staff_id: string;
  paid_at: string | null;
  [key: string]: unknown;
}

interface GridRow {
  staff: Staff;
  status: 'pending' | 'settled' | 'paid';
  calc: SettlementResult | null;
  inputs: SettlementInputs | null;
  stored: StoredSettlement | null;
  error?: string;
}

interface Filters {
  outletId: string;
  department: string;
  range: DateRange;
}

interface SheetLock { id: string; month: string; locked_at: string }

const CONCURRENCY = 8;

// ---- rules drawer field configs (existing settings tables only) -------------
const HR_PAY_RULES_FIELDS: RuleField[] = [
  { key: 'full_day_minutes', label: 'Full day at (worked minutes)', type: 'number' },
  { key: 'half_day_minutes', label: 'Half day at (worked minutes)', type: 'number' },
  { key: 'unscheduled_is_off', label: 'Unscheduled day is a paid off', type: 'boolean', help: 'When ON, a day with no roster entry is paid as an off-day — absences will NOT deduct for unrostered staff.' },
  { key: 'comp_off_enabled', label: 'Comp-off for worked off-days', type: 'boolean' },
];
const DISCIPLINE_FIELDS: RuleField[] = [
  { key: 'penalties_enabled', label: 'Penalties enabled', type: 'boolean' },
  { key: 'grace_minutes_in', label: 'Late-in grace (minutes)', type: 'number' },
  { key: 'grace_minutes_out', label: 'Early-out grace (minutes)', type: 'number' },
  { key: 'late_in_slabs', label: 'Late-in fine slabs', type: 'json', help: '[{"from_min":15,"to_min":30,"amount":50}, …]' },
  { key: 'early_out_slabs', label: 'Early-out fine slabs', type: 'json' },
  { key: 'late_in_half_day_after_min', label: 'Late-in → half day after (min)', type: 'number' },
  { key: 'late_in_full_day_after_min', label: 'Late-in → full day after (min)', type: 'number' },
  { key: 'absent_no_checkin_deduction', label: 'No check-in deduction', type: 'select', options: [
    { value: 'full_day', label: 'Full day' }, { value: 'half_day', label: 'Half day' }, { value: 'none', label: 'None' },
  ] },
];
const PF_FIELDS: RuleField[] = [
  { key: 'pf_enabled', label: 'PF enabled', type: 'boolean' },
  { key: 'pf_employee_rate', label: 'Employee rate (%)', type: 'number', step: '0.01' },
  { key: 'pf_employer_rate', label: 'Employer rate (%)', type: 'number', step: '0.01' },
  { key: 'pf_base_cap', label: 'Wage base cap (₹)', type: 'number' },
  { key: 'pf_calc_base', label: 'Rate applies to', type: 'select', options: [
    { value: 'gross', label: 'Gross salary' }, { value: 'basic', label: 'Basic component' },
  ] },
  { key: 'pf_default_enroll', label: 'Enroll new staff by default', type: 'boolean' },
];
const ESI_FIELDS: RuleField[] = [
  { key: 'esi_enabled', label: 'ESI enabled', type: 'boolean' },
  { key: 'esi_employer_rate', label: 'Employer rate (%)', type: 'number', step: '0.01' },
  { key: 'esi_eligibility_ceiling', label: 'Eligibility ceiling (₹/month)', type: 'number' },
  { key: 'esi_calc_base', label: 'Rate applies to', type: 'select', options: [
    { value: 'gross', label: 'Gross salary' }, { value: 'basic', label: 'Basic component' },
  ] },
];
const PT_FIELDS: RuleField[] = [
  { key: 'pt_enabled', label: 'Professional Tax enabled', type: 'boolean' },
  { key: 'pt_slabs', label: 'Monthly slabs (gross up-to → amount)', type: 'json', help: '[{"up_to":10000,"amount":0},{"up_to":15000,"amount":110}, …] — West Bengal slab table' },
  { key: 'pt_monthly_amount', label: 'Flat monthly amount (₹, when no slabs)', type: 'number' },
  { key: 'pt_min_gross', label: 'Minimum gross for PT (₹)', type: 'number' },
];

export default function ProcessPayroll() {
  const navigate = useNavigate();
  const { user, staffData, can } = useAuth();
  const { data: org } = useOrganizationProfile();

  const [applied, setApplied] = useState<Filters | null>(null);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lock, setLock] = useState<SheetLock | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [mastersLoaded, setMastersLoaded] = useState(false);

  const [rulesDrawer, setRulesDrawer] = useState<null | 'attendance' | 'penalties' | 'pf' | 'esi' | 'pt'>(null);
  const [previewRow, setPreviewRow] = useState<GridRow | null>(null);
  const [adjustRow, setAdjustRow] = useState<GridRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [confirmLock, setConfirmLock] = useState<null | 'lock' | 'unlock'>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [finalizeState, setFinalizeState] = useState<null | { total: number; done: number; failed: { name: string; error: string }[]; running: boolean }>(null);
  const searchSeq = useRef(0);

  const month = applied ? applied.range.from.slice(0, 7) : null;
  const monthLabel = month ? format(parseISO(month + '-01'), 'MMMM yyyy') : '';
  const canLock = can('settlements.lock');
  const canEditPayrollRules = can('settings.payroll.edit');
  const canEditAttendanceRules = can('settings.attendance.edit');

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

  // ---- search: load scope + compute every row through the ONE engine --------
  const runSearch = async (filters: Filters) => {
    const seq = ++searchSeq.current;
    const m = filters.range.from.slice(0, 7);
    setApplied(filters);
    setSelected(new Set());
    setRows([]);
    setLoadedCount(0);
    setLoadingGrid(true);
    try {
      const monthStart = `${m}-01`;
      let staffQuery = supabase.from('staff').select('*').order('full_name');
      if (filters.outletId !== 'all') staffQuery = staffQuery.eq('outlet_id', filters.outletId);
      if (filters.department !== 'all') staffQuery = staffQuery.eq('department', filters.department);

      const [staffRes, settledRes, lockRes] = await Promise.all([
        staffQuery,
        supabase.from('salary_settlements').select('*').eq('settlement_month', m),
        supabase.from('salary_sheet_locks' as never).select('*').eq('month', m).maybeSingle(),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (seq !== searchSeq.current) return;

      setLock(lockRes.error ? null : ((lockRes.data as unknown as SheetLock | null) ?? null));

      // In scope: active staff, plus staff who left during/after this month.
      const staffRows = ((staffRes.data ?? []) as Staff[]).filter(
        (s) => s.is_active || (s.date_of_leaving && s.date_of_leaving >= monthStart),
      );
      const storedByStaff = new Map<string, StoredSettlement>();
      for (const st of (settledRes.data ?? []) as unknown as StoredSettlement[]) storedByStaff.set(st.staff_id, st);

      const initial: GridRow[] = staffRows.map((staff) => {
        const stored = storedByStaff.get(staff.id) ?? null;
        return {
          staff,
          stored,
          calc: null,
          inputs: null,
          status: stored ? (stored.paid_at ? 'paid' : 'settled') : 'pending',
        };
      });
      setRows(initial);

      // Compute pending rows in parallel with a concurrency cap.
      const pending = initial.filter((r) => r.status === 'pending');
      let idx = 0;
      const worker = async () => {
        for (;;) {
          const i = idx++;
          if (i >= pending.length || seq !== searchSeq.current) return;
          const row = pending[i];
          try {
            const inputs = await gatherSettlementInputs(row.staff, m);
            const calc = computeSettlement(inputs);
            if (seq !== searchSeq.current) return;
            setRows((prev) => prev.map((r) => (r.staff.id === row.staff.id ? { ...r, inputs, calc } : r)));
          } catch (e) {
            if (seq !== searchSeq.current) return;
            setRows((prev) => prev.map((r) => (r.staff.id === row.staff.id ? { ...r, error: e instanceof Error ? e.message : 'compute failed' } : r)));
          } finally {
            setLoadedCount((c) => c + 1);
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load payroll');
    } finally {
      if (seq === searchSeq.current) setLoadingGrid(false);
    }
  };

  const recompute = () => { if (applied) runSearch(applied); };

  // ---- cell accessors (computed calc OR stored settled snapshot) ------------
  const num = (row: GridRow, calcKey: keyof SettlementResult, storedKey: string): number => {
    if (row.calc) return toAmount(row.calc[calcKey] as number);
    if (row.stored) return toAmount(row.stored[storedKey] as number);
    return 0;
  };
  const daysInM = month ? getDaysInMonth(parseISO(month + '-01')) : 30;

  // ---- finalize -------------------------------------------------------------
  const selectedRows = rows.filter((r) => selected.has(r.staff.id) && r.status === 'pending' && r.calc);
  const selectedNetTotal = selectedRows.reduce((sum, r) => sum + (r.calc?.netPayable ?? 0), 0);

  const runFinalize = async () => {
    if (!user?.id || !month || selectedRows.length === 0) return;
    const approverName = getUserDisplayName(user, staffData);
    // Lifted from PayrollGroups.runBatch(): per-row guard + failure collection.
    setFinalizeState({ total: selectedRows.length, done: 0, failed: [], running: true });
    const failed: { name: string; error: string }[] = [];
    let done = 0;
    for (const row of selectedRows) {
      try {
        if (await isMonthSettled(row.staff.id, month)) continue; // guard against double-settle
        const inputs = row.inputs ?? (await gatherSettlementInputs(row.staff, month));
        const calc = computeSettlement(inputs);
        await persistGroupSettlement(calc, { staff: row.staff, month, userId: user.id, approverName });
        done += 1;
      } catch (e) {
        failed.push({ name: row.staff.full_name, error: e instanceof Error ? e.message : 'failed' });
      }
      setFinalizeState({ total: selectedRows.length, done: done + failed.length, failed: [...failed], running: true });
    }
    setFinalizeState({ total: selectedRows.length, done: done + failed.length, failed, running: false });
    toast[failed.length ? 'error' : 'success'](`Finalized ${done} of ${selectedRows.length}${failed.length ? ` · ${failed.length} failed` : ''}`);
    setSelected(new Set());
    recompute();
  };

  // ---- lock -----------------------------------------------------------------
  const toggleLock = async () => {
    if (!user?.id || !month || !confirmLock) return;
    setLockBusy(true);
    try {
      if (confirmLock === 'lock') {
        const { error } = await supabase.from('salary_sheet_locks' as never).insert({ month, locked_by: user.id } as never);
        if (error) throw error;
        toast.success(`Salary sheet for ${monthLabel} is locked`);
      } else {
        const { error } = await supabase.from('salary_sheet_locks' as never).delete().eq('month', month);
        if (error) throw error;
        toast.success(`Salary sheet for ${monthLabel} is unlocked`);
      }
      setConfirmLock(null);
      recompute();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the lock');
    } finally {
      setLockBusy(false);
    }
  };

  // ---- adjust (the one audited escape hatch) --------------------------------
  const saveAdjustment = async () => {
    if (!adjustRow || !month || !user?.id) return;
    const amount = Number(adjustAmount);
    if (!amount || Number.isNaN(amount)) { toast.error('Enter a non-zero amount (use a minus sign to deduct)'); return; }
    if (!adjustReason.trim()) { toast.error('A reason is mandatory for adjustments'); return; }
    setAdjustBusy(true);
    try {
      const { error } = await supabase.from('salary_arrears').insert({
        staff_id: adjustRow.staff.id,
        amount,
        reason: adjustReason.trim(),
        settlement_month: month,
        status: 'pending',
        created_by: user.id,
      } as never);
      if (error) throw error;
      toast.success(`Adjustment of ₹${amount.toLocaleString('en-IN')} recorded for ${adjustRow.staff.full_name} — it folds into this month's net pay.`);
      setAdjustRow(null);
      setAdjustAmount('');
      setAdjustReason('');
      recompute();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the adjustment');
    } finally {
      setAdjustBusy(false);
    }
  };

  // ---- preview payslip shape ------------------------------------------------
  const previewSettlement = (row: GridRow): PayslipSettlement | null => {
    if (row.stored) return row.stored as unknown as PayslipSettlement;
    if (!row.calc || !month) return null;
    const c = row.calc;
    return {
      settlement_month: month,
      base_salary: c.monthlySalary,
      earnings_basic: c.basic,
      earnings_hra: c.hra,
      earnings_allowances: c.allowances,
      incentives: c.incentives,
      bonus: c.bonus,
      overtime_amount: c.overtimeAmount,
      leave_days: c.finalDeductionDays,
      leave_deduction: c.leaveDeduction,
      absent_deduction_days: c.absentDeductionDays,
      absent_deduction: c.absentDeduction,
      discipline_fine: c.disciplineFine,
      pf_employee: c.pfEmployee,
      pf_employer: c.pfEmployer,
      esi_employee: c.esiEmployee,
      esi_employer: c.esiEmployer,
      pt_amount: c.ptAmount,
      loan_emi_total: c.loanEmiTotal,
      advances_adjusted: c.advanceToAdjust,
      arrears: c.arrears,
      net_salary: c.grossSalary,
      balance_payable: c.netPayable,
      settled_at: null,
      paid_at: null,
      payment_mode: null,
    };
  };

  // ---- columns --------------------------------------------------------------
  const dayTone = (v: number, kind: 'positive' | 'negative') => (v > 0 ? kind : undefined);
  const columns: DataTableColumn<GridRow>[] = [
    {
      key: 'employee', width: 210,
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="truncate font-medium leading-tight">{r.staff.full_name}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {r.staff.employee_id}{r.staff.department ? ` - ${r.staff.department}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'role', width: 150,
      header: 'Role & outlet',
      render: (r) => (
        <div>
          <p className="truncate text-xs leading-tight">{(r.staff as { designation?: string | null }).designation ?? '—'}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {outlets.find((o) => o.id === (r.staff as { outlet_id?: string | null }).outlet_id)?.name ?? '—'}
          </p>
        </div>
      ),
    },
    { key: 'present', header: <HeaderMaybeConfig label="Present" onOpen={canOpenAttendanceRules() ? () => setRulesDrawer('attendance') : undefined} />, align: 'center', cellTone: (r) => dayTone(num(r, 'presentDays', 'present_days'), 'positive'), render: (r) => cellNum(r, num(r, 'presentDays', 'present_days')) },
    { key: 'half', header: <HeaderMaybeConfig label="Half" onOpen={canOpenAttendanceRules() ? () => setRulesDrawer('attendance') : undefined} />, align: 'center', cellTone: (r) => dayTone(num(r, 'halfDays', 'half_days'), 'positive'), render: (r) => cellNum(r, num(r, 'halfDays', 'half_days')) },
    { key: 'off', header: <HeaderMaybeConfig label="Off" onOpen={canOpenAttendanceRules() ? () => setRulesDrawer('attendance') : undefined} />, align: 'center', cellTone: (r) => dayTone(num(r, 'offDays', 'off_days'), 'positive'), render: (r) => cellNum(r, num(r, 'offDays', 'off_days')) },
    { key: 'leave', header: 'Leave', align: 'center', cellTone: (r) => dayTone(num(r, 'paidLeaveDays', 'paid_leave_days'), 'positive'), render: (r) => cellNum(r, num(r, 'paidLeaveDays', 'paid_leave_days')) },
    { key: 'absent', header: <HeaderMaybeConfig label="Absent" onOpen={canOpenAttendanceRules() ? () => setRulesDrawer('attendance') : undefined} />, align: 'center', cellTone: (r) => dayTone(num(r, 'absentDays', 'absent_days'), 'negative'), render: (r) => cellNum(r, num(r, 'absentDays', 'absent_days')) },
    { key: 'salary', header: 'Salary', align: 'right', render: (r) => money(num(r, 'monthlySalary', 'base_salary')) },
    { key: 'daily', header: 'Daily Wage', align: 'right', render: (r) => money(num(r, 'monthlySalary', 'base_salary') / daysInM) },
    { key: 'earned', header: 'Earned', align: 'right', render: (r) => money(num(r, 'grossSalary', 'net_salary')) },
    { key: 'leaveded', header: 'Leave Ded', align: 'right', render: (r) => money(num(r, 'leaveDeduction', 'leave_deduction') + num(r, 'absentDeduction', 'absent_deduction')) },
    { key: 'penalties', header: <HeaderMaybeConfig label="Penalties" onOpen={canOpenAttendanceRules() ? () => setRulesDrawer('penalties') : undefined} />, align: 'right', render: (r) => money(num(r, 'disciplineFine', 'discipline_fine')) },
    { key: 'pf', header: <HeaderMaybeConfig label="PF" onOpen={() => setRulesDrawer('pf')} />, align: 'right', render: (r) => money(num(r, 'pfEmployee', 'pf_employee')) },
    { key: 'esi', header: <HeaderMaybeConfig label="ESI" onOpen={() => setRulesDrawer('esi')} />, align: 'right', render: (r) => money(num(r, 'esiEmployee', 'esi_employee')) },
    { key: 'pt', header: <HeaderMaybeConfig label="PT" onOpen={() => setRulesDrawer('pt')} />, align: 'right', render: (r) => money(num(r, 'ptAmount', 'pt_amount')) },
    { key: 'advance', header: 'Advance', align: 'right', render: (r) => money(num(r, 'advanceToAdjust', 'advances_adjusted')) },
    { key: 'emi', header: 'Loan EMI', align: 'right', render: (r) => money(num(r, 'loanEmiTotal', 'loan_emi_total')) },
    { key: 'arrears', header: 'Arrears', align: 'right', render: (r) => money(num(r, 'arrears', 'arrears')) },
    { key: 'net', header: 'NET PAYABLE', align: 'right', bold: true, render: (r) => money(num(r, 'netPayable', 'balance_payable')) },
    {
      key: 'status', header: 'Status', align: 'center',
      render: (r) => r.error
        ? <Badge variant="destructive" title={r.error}>Error</Badge>
        : r.status === 'paid'
          ? <Badge>Paid</Badge>
          : r.status === 'settled'
            ? <Badge variant="secondary">Settled</Badge>
            : <Badge variant="outline">Pending</Badge>,
    },
    {
      key: 'menu', header: '', align: 'center',
      render: (r) => (
        <RowMenu items={[
          { label: 'Preview', icon: Eye, onSelect: () => setPreviewRow(r) },
          { label: 'Adjust', icon: Pencil, disabled: r.status !== 'pending' || !!lock, onSelect: () => setAdjustRow(r) },
          { label: 'View Attendance', icon: User, onSelect: () => navigate(`/bulk-attendance?staff=${r.staff.id}&from=${applied?.range.from}&to=${applied?.range.to}`) },
          { label: 'Ledger', icon: Wallet, onSelect: () => navigate(`/ledger?staff=${r.staff.id}`) },
        ]} />
      ),
    },
  ];

  function canOpenAttendanceRules() { return true; } // drawer itself is read-only without the permission
  function cellNum(r: GridRow, v: number) {
    if (!r.calc && !r.stored) return <span className="text-muted-foreground">…</span>;
    return v % 1 === 0 ? v : v.toFixed(1);
  }
  function money(v: number) {
    return v ? v.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0';
  }

  const initialRange: DateRange = {
    from: format(subMonths(new Date(), 1), 'yyyy-MM-01'),
    to: format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd'),
  };

  const exportColumns = [
    { header: 'Employee', value: (r: GridRow) => r.staff.full_name },
    { header: 'Code', value: (r: GridRow) => r.staff.employee_id },
    { header: 'Present', value: (r: GridRow) => num(r, 'presentDays', 'present_days') },
    { header: 'Half', value: (r: GridRow) => num(r, 'halfDays', 'half_days') },
    { header: 'Off', value: (r: GridRow) => num(r, 'offDays', 'off_days') },
    { header: 'Leave', value: (r: GridRow) => num(r, 'paidLeaveDays', 'paid_leave_days') },
    { header: 'Absent', value: (r: GridRow) => num(r, 'absentDays', 'absent_days') },
    { header: 'Salary', value: (r: GridRow) => num(r, 'monthlySalary', 'base_salary') },
    { header: 'Earned', value: (r: GridRow) => num(r, 'grossSalary', 'net_salary') },
    { header: 'PF', value: (r: GridRow) => num(r, 'pfEmployee', 'pf_employee') },
    { header: 'ESI', value: (r: GridRow) => num(r, 'esiEmployee', 'esi_employee') },
    { header: 'PT', value: (r: GridRow) => num(r, 'ptAmount', 'pt_amount') },
    { header: 'Advance', value: (r: GridRow) => num(r, 'advanceToAdjust', 'advances_adjusted') },
    { header: 'Loan EMI', value: (r: GridRow) => num(r, 'loanEmiTotal', 'loan_emi_total') },
    { header: 'Arrears', value: (r: GridRow) => num(r, 'arrears', 'arrears') },
    { header: 'Net Payable', value: (r: GridRow) => num(r, 'netPayable', 'balance_payable') },
    { header: 'Status', value: (r: GridRow) => r.status },
  ];

  const stillComputing = loadingGrid || rows.some((r) => r.status === 'pending' && !r.calc && !r.error);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Process Payroll"
        count={applied ? rows.length : undefined}
        actions={
          <>
            {canLock && applied && (
              lock ? (
                <Button variant="outline" className="gap-1.5" onClick={() => setConfirmLock('unlock')}>
                  <LockOpen className="h-4 w-4" /> Unlock Sheet
                </Button>
              ) : (
                <Button variant="outline" className="gap-1.5" onClick={() => setConfirmLock('lock')}>
                  <Lock className="h-4 w-4" /> Lock Sheet
                </Button>
              )
            )}
            <ActionsMenu
              exportConfig={{ filename: `payroll-${month ?? 'period'}`, title: `Process Payroll — ${monthLabel}`, columns: exportColumns, rows }}
            />
            <Button
              disabled={selectedRows.length === 0 || !!lock || stillComputing}
              onClick={runFinalize}
              className="gap-1.5"
            >
              <Calculator className="h-4 w-4" /> Finalize {selectedRows.length > 0 ? selectedRows.length : ''} Selected
            </Button>
          </>
        }
      />

      {applied && month && (
        <PayrollDataIntegrityBanner
          from={applied.range.from}
          to={applied.range.to}
          outletId={applied.outletId === 'all' ? null : applied.outletId}
        />
      )}

      <div onFocusCapture={loadMasters} onPointerEnter={loadMasters}>
        <FilterBar<Filters>
          initial={{ outletId: 'all', department: 'all', range: initialRange }}
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
              <DateRangeField value={draft.range} onChange={(range) => setDraft({ ...draft, range })} />
            </>
          )}
        </FilterBar>
      </div>

      <InlineNote>
        Finalized months are locked. De-finalize from Finalized Payroll to make changes. Payroll runs per calendar
        month — the month is taken from the range's start date{applied ? ` (${monthLabel})` : ''}.
      </InlineNote>

      {lock && (
        <InlineNote>
          <span className="font-medium text-warning">Salary sheet for {monthLabel} is locked</span> (since{' '}
          {format(new Date(lock.locked_at), 'dd MMM, h:mm a')}). Settlements cannot be added or changed until it is unlocked.
        </InlineNote>
      )}

      {stillComputing && applied && (
        <p className="text-xs text-muted-foreground">Computing {loadedCount} of {rows.filter((r) => !r.stored).length} settlements…</p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.staff.id}
        stickyColumns={2}
        selectable
        selected={selected}
        onSelectedChange={(next) => {
          // Only pending, computed rows are selectable.
          const allowed = new Set(rows.filter((r) => r.status === 'pending' && r.calc).map((r) => r.staff.id));
          setSelected(new Set([...next].filter((k) => allowed.has(k))));
        }}
        loading={loadingGrid && rows.length === 0}
        defaultPageSize={50}
        selectionSummary={
          <span className="text-muted-foreground">
            Net total <Amount value={selectedNetTotal} size="sm" className="font-semibold text-foreground" />
          </span>
        }
        empty={
          <EmptyState
            icon={Inbox}
            title={applied ? 'No staff in this scope' : 'No payroll loaded yet'}
            instruction={applied ? 'Widen the outlet or department filters above and press Search again.' : 'Choose an outlet and date range above and press Search.'}
          />
        }
      />

      {/* ---- rules drawers ---- */}
      <RulesDrawer open={rulesDrawer === 'attendance'} onOpenChange={(o) => !o && setRulesDrawer(null)} title="Attendance day rules" table="hr_pay_rules" fields={HR_PAY_RULES_FIELDS} canEdit={canEditAttendanceRules} onSaved={recompute} />
      <RulesDrawer open={rulesDrawer === 'penalties'} onOpenChange={(o) => !o && setRulesDrawer(null)} title="Penalty rules" table="discipline_rules" fields={DISCIPLINE_FIELDS} canEdit={canEditAttendanceRules} onSaved={recompute} />
      <RulesDrawer open={rulesDrawer === 'pf'} onOpenChange={(o) => !o && setRulesDrawer(null)} title="Provident Fund rules" table="payroll_statutory_settings" fields={PF_FIELDS} canEdit={canEditPayrollRules} onSaved={recompute} />
      <RulesDrawer open={rulesDrawer === 'esi'} onOpenChange={(o) => !o && setRulesDrawer(null)} title="ESI rules" table="payroll_statutory_settings" fields={ESI_FIELDS} canEdit={canEditPayrollRules} onSaved={recompute} />
      <RulesDrawer open={rulesDrawer === 'pt'} onOpenChange={(o) => !o && setRulesDrawer(null)} title="Professional Tax rules" table="payroll_statutory_settings" fields={PT_FIELDS} canEdit={canEditPayrollRules} onSaved={recompute} />

      {/* ---- preview drawer ---- */}
      <Drawer
        open={!!previewRow}
        onOpenChange={(o) => !o && setPreviewRow(null)}
        title={previewRow ? `${previewRow.staff.full_name} — ${monthLabel}` : ''}
        size="lg"
        footer={
          previewRow && (
            <Button
              className="w-full gap-1.5"
              onClick={async () => {
                const s = previewSettlement(previewRow);
                if (!s) return;
                await downloadPayslipPDF(previewRow.staff as never, s as never, {
                  name: (org?.trade_name || org?.legal_name) ?? null,
                  address: [org?.address, org?.city, org?.pincode].filter(Boolean).join(', ') || null,
                } as never);
              }}
            >
              <FileText className="h-4 w-4" /> Download PDF
            </Button>
          )
        }
      >
        {previewRow && <PreviewBreakdown row={previewRow} settlement={previewSettlement(previewRow)} />}
      </Drawer>

      {/* ---- adjust drawer ---- */}
      <Drawer
        open={!!adjustRow}
        onOpenChange={(o) => { if (!o) { setAdjustRow(null); setAdjustAmount(''); setAdjustReason(''); } }}
        title={adjustRow ? `Adjust — ${adjustRow.staff.full_name}` : ''}
        size="md"
        description="Writes an explicit, audited adjustment line (arrears) that folds into this month's net pay at finalize. Wrong attendance should be fixed in Bulk Attendance Adjustments instead."
        footer={
          <Button className="w-full" onClick={saveAdjustment} disabled={adjustBusy}>
            {adjustBusy ? 'Saving…' : 'Record adjustment'}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Amount (₹) — positive adds, negative deducts *</Label>
            <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="e.g. 500 or -500" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (mandatory) *</Label>
            <Textarea rows={3} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Why is this adjustment needed?" />
          </div>
        </div>
      </Drawer>

      {/* ---- lock confirm ---- */}
      <AlertDialog open={confirmLock !== null} onOpenChange={(o) => !o && !lockBusy && setConfirmLock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmLock === 'lock' ? `Lock salary sheet for ${monthLabel}?` : `Unlock salary sheet for ${monthLabel}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmLock === 'lock'
                ? 'Once locked, no settlement for this month can be added, edited or deleted by anyone until the sheet is unlocked.'
                : 'Unlocking allows settlements for this month to be added or changed again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lockBusy}>Go Back</AlertDialogCancel>
            <AlertDialogAction disabled={lockBusy} onClick={(e) => { e.preventDefault(); toggleLock(); }}>
              {lockBusy ? 'Working…' : confirmLock === 'lock' ? 'Lock sheet' : 'Unlock sheet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---- finalize progress ---- */}
      <Dialog open={finalizeState !== null} onOpenChange={(o) => { if (!o && finalizeState && !finalizeState.running) setFinalizeState(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{finalizeState?.running ? 'Finalizing payroll…' : 'Finalize complete'}</DialogTitle>
          </DialogHeader>
          {finalizeState && (
            <div className="space-y-3">
              <Progress value={(finalizeState.done / Math.max(1, finalizeState.total)) * 100} />
              <p className="text-sm text-muted-foreground">
                {finalizeState.done} of {finalizeState.total} processed
                {finalizeState.failed.length > 0 && <> · <span className="text-destructive">{finalizeState.failed.length} failed</span></>}
              </p>
              {finalizeState.failed.map((f, i) => (
                <p key={i} className="text-xs text-destructive">{f.name}: {f.error}</p>
              ))}
              {!finalizeState.running && (
                <Button className="w-full" onClick={() => setFinalizeState(null)}>Close</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HeaderMaybeConfig({ label, onOpen }: { label: string; onOpen?: () => void }) {
  if (!onOpen) return <>{label}</>;
  return <ConfigurableHeader label={label} onOpen={onOpen} />;
}

/** The payslip-shaped breakdown inside the Preview drawer. */
function PreviewBreakdown({ row, settlement }: { row: GridRow; settlement: PayslipSettlement | null }) {
  if (!settlement) return <p className="text-sm text-muted-foreground">Still computing this row…</p>;
  const s = settlement;
  const section = (title: string, items: [string, number][]) => {
    const nonZero = items.filter(([, v]) => Math.abs(v) > 0.004);
    if (nonZero.length === 0) return null;
    return (
      <div key={title}>
        <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">Heads</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {nonZero.map(([label, v]) => (
              <tr key={label}>
                <td className="py-1">{label}</td>
                <td className="py-1 text-right">{v.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {row.staff.employee_id} · Status: {row.status}
      </p>
      {section('Gross Earnings', [
        ['Basic', toAmount(s.earnings_basic)],
        ['HRA', toAmount(s.earnings_hra)],
        ['Other allowance', toAmount(s.earnings_allowances)],
        ['Earned salary', (toAmount(s.earnings_basic) + toAmount(s.earnings_hra) + toAmount(s.earnings_allowances)) > 0 ? 0 : toAmount(s.base_salary)],
      ])}
      {section('Other Earnings', [
        ['Incentives', toAmount(s.incentives)],
        ['Bonus', toAmount(s.bonus)],
        ['Overtime', toAmount(s.overtime_amount)],
        ['Arrears (back-pay)', Math.max(0, toAmount(s.arrears ?? 0))],
      ])}
      {section("Employee's Contribution", [
        ['PF Employee', toAmount(s.pf_employee)],
        ['ESI Employee', toAmount(s.esi_employee)],
        ['Professional Tax', toAmount(s.pt_amount)],
      ])}
      {section('Deductions', [
        [`Leave deduction (${s.leave_days ?? 0} d)`, toAmount(s.leave_deduction)],
        [`Absent days (${s.absent_deduction_days ?? 0} d)`, toAmount(s.absent_deduction ?? 0)],
        ['Discipline fine', toAmount(s.discipline_fine)],
        ['Loan EMI', toAmount(s.loan_emi_total)],
        ['Advance adjustment', toAmount(s.advances_adjusted)],
        ['Arrears recovery', Math.max(0, -toAmount(s.arrears ?? 0))],
      ])}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2">
        <span className="font-semibold">Net Payable</span>
        <span className="font-bold text-primary [font-variant-numeric:tabular-nums]">
          ₹{toAmount(s.balance_payable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
