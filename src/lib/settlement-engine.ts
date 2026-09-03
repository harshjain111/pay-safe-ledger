// ============================================================================
// Settlement engine (extracted from Settlements.tsx for batch reuse).
//
//   computeSettlement(inputs, opts)  -> PURE salary math (unit-tested).
//   gatherSettlementInputs(staff, m) -> async fetch of everything it needs.
//   persistGroupSettlement(calc, …)  -> writes the journal + settlement + payout
//                                        request (reuses the SAME journal helper
//                                        the per-staff screen uses).
//
// PHASE 3A (Attendo rebuild): this engine is now THE ONLY payroll formula.
// The per-staff screen (Settlements.tsx) and the Process Payroll grid both run
// gatherSettlementInputs -> computeSettlement -> persistGroupSettlement.
// Never write a second implementation of this math.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';
import { getDaysInMonth, parseISO } from 'date-fns';
import { toAmount } from '@/lib/utils';
import { computeDayBreakdown, type DayBreakdown } from '@/lib/attendance-pay';
import { resolveHolidayDatesForStaff, type HolidayRow, type HolidayAssignmentRow } from '@/lib/holidays';
import {
  getStaffStructure, prorateStructure, computeProfessionalTax, computeAutoOvertime,
  getLoanEMIsForMonth, loanEmisFromRows, type LoanEMI, type PTSlab,
} from '@/lib/payroll';
import { getMonthlyDisciplineFine, sumDisciplineFine, type DisciplineLogRow } from '@/lib/discipline';
import { createSalarySettlementEntry, createArrearsEntry } from '@/lib/journal-entries';
import { supabase as anyDb } from '@/integrations/supabase/anyClient';
import { mergeTemplateHolidays } from '@/lib/leave-allocation';
import type { Staff } from '@/types/database';

export interface StatutorySettings {
  pf_enabled: boolean;
  pf_employee_rate: number;
  pf_employer_rate: number;
  pf_base_cap: number;
  /** Wage the PF/ESI rate applies to: 'basic' component or 'gross' salary. */
  pf_calc_base?: 'basic' | 'gross';
  esi_enabled: boolean;
  esi_employer_rate: number;
  esi_eligibility_ceiling: number;
  esi_calc_base?: 'basic' | 'gross';
  pt_enabled: boolean;
  pt_monthly_amount: number;
  pt_min_gross: number;
  pt_slabs?: PTSlab[] | null;
  ot_enabled?: boolean;
  ot_standard_minutes?: number;
  ot_multiplier?: number;
}

export interface SettlementResult {
  monthlySalary: number; // pro-rata contractual
  basic: number;
  hra: number;
  allowances: number;
  incentives: number;
  bonus: number;
  overtimeAuto: number;
  overtimeAmount: number;
  dailySalary: number;
  systemDeductionDays: number;
  finalDeductionDays: number;
  leaveDeduction: number;
  absentDeductionDays: number;
  absentDeduction: number;
  presentDays: number;
  halfDays: number;
  offDays: number;
  paidLeaveDays: number;
  absentDays: number;
  compOffEarned: number;
  attendanceTracked: boolean;
  disciplineFine: number;
  pfEmployee: number;
  pfEmployer: number;
  pfBase: number;
  pfRateEmployee: number;
  pfRateEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  esiBase: number;
  esiRateEmployee: number;
  esiRateEmployer: number;
  esiEligible: boolean;
  ptAmount: number;
  loanEmis: LoanEMI[];
  loanEmiTotal: number;
  grossSalary: number;
  advancesOutstanding: number;
  advanceToAdjust: number;
  netPayable: number;
  carryForwardAdvance: number;
  effectiveDays: number;
  arrears: number; // signed arrears folded into net pay (distinct line)
}

export interface SettlementInputs {
  staff: Staff;
  month: string; // yyyy-MM
  monthlySalary: number; // from get_staff_salary_for_month
  advancesOutstanding: number;
  statutory: StatutorySettings | null;
  dayBreakdown: DayBreakdown | null;
  attendanceTracked: boolean;
  compOffEnabled: boolean;
  disciplineFine: number;
  systemDeductionDays: number; // approved-leave deduction days
  overtimeAuto: number;
  loanEmis: LoanEMI[];
  arrearsTotal: number; // signed; pending arrears for this settlement month
}

export interface ComputeOpts {
  /** Defaults to systemDeductionDays (no manual adjustment in a batch). */
  finalDeductionDays?: number;
  incentives?: number;
  bonus?: number;
  overtimeOverride?: number | null;
  absentDaysOverride?: number | null;
  advanceToAdjust?: number;
  /** Group-policy statutory overrides (apply the group's defaults to members). */
  pfEnrolledOverride?: boolean;
  esiEnrolledOverride?: boolean;
  rounding?: 'none' | 'nearest' | 'up' | 'down';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function applyRounding(n: number, mode: ComputeOpts['rounding']): number {
  switch (mode) {
    case 'nearest': return Math.round(n);
    case 'up': return Math.ceil(n);
    case 'down': return Math.floor(n);
    default: return round2(n);
  }
}

/**
 * Pure salary settlement math — mirrors the per-staff screen's system-default
 * calculation (no manual incentives/bonus/overtime/advance overrides unless
 * passed in opts).
 */
export function computeSettlement(inp: SettlementInputs, opts: ComputeOpts = {}): SettlementResult {
  const cs = inp.staff;
  const s = inp.statutory;
  const finalDeductionDays = opts.finalDeductionDays ?? inp.systemDeductionDays;
  const incentives = opts.incentives ?? 0;
  const bonus = opts.bonus ?? 0;
  const overtimeOverride = opts.overtimeOverride ?? null;
  const absentDaysOverride = opts.absentDaysOverride ?? null;
  const advanceToAdjust = opts.advanceToAdjust ?? 0;

  const monthlySalary = toAmount(inp.monthlySalary);
  const daysInMonth = getDaysInMonth(parseISO(inp.month + '-01'));
  const dailySalary = monthlySalary / daysInMonth;

  // ---- pro-rata (join / leave within the month) ----
  const monthStart = parseISO(inp.month + '-01');
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  let effectiveDays = daysInMonth;
  const joiningDate = parseISO(cs.date_of_joining);
  const joinsMidMonth = joiningDate > monthStart && joiningDate <= monthEnd;
  if (joinsMidMonth) effectiveDays = daysInMonth - joiningDate.getDate() + 1;
  if (cs.date_of_leaving) {
    const leavingDate = parseISO(cs.date_of_leaving);
    if (leavingDate < monthStart) {
      effectiveDays = 0;
    } else if (leavingDate <= monthEnd) {
      const exitDay = leavingDate.getDate();
      const joiningDay = joinsMidMonth ? joiningDate.getDate() : 1;
      effectiveDays = Math.max(0, exitDay - joiningDay + 1);
    }
  } else if (cs.is_active === false) {
    const updatedAt = parseISO(cs.updated_at);
    if (updatedAt >= monthStart && updatedAt <= monthEnd) {
      const exitDay = updatedAt.getDate();
      const joiningDay = joinsMidMonth ? joiningDate.getDate() : 1;
      effectiveDays = Math.max(0, exitDay - joiningDay + 1);
    }
  }

  const proRataSalary = dailySalary * effectiveDays;
  const leaveDeduction = dailySalary * finalDeductionDays;

  const fullStructure = getStaffStructure(cs);
  const prorated = prorateStructure(fullStructure, effectiveDays, daysInMonth);

  const attendanceTracked = inp.attendanceTracked;
  const bd = inp.dayBreakdown;
  const absentDeductionDays = absentDaysOverride !== null ? absentDaysOverride : (bd?.absentDeductionDays ?? 0);
  const absentDeduction = round2(dailySalary * absentDeductionDays);
  const compOffEarned = inp.compOffEnabled ? (bd?.offWorkedDays ?? 0) : 0;
  const disciplineFine = inp.disciplineFine;

  // ---- statutory (group policy can override the staff enrolment flags) ----
  const pfEnrolled = opts.pfEnrolledOverride ?? cs.pf_enrolled;
  const esiEnrolled = opts.esiEnrolledOverride ?? cs.esi_enrolled;

  const pfActive = !!(s?.pf_enabled && pfEnrolled);
  const pfRateEmployee = pfActive ? toAmount((cs as { pf_employee_rate_override?: number | null }).pf_employee_rate_override ?? s?.pf_employee_rate) : 0;
  const pfRateEmployer = pfActive ? (s?.pf_employer_rate ?? 0) : 0;
  // PF wage = basic component or gross salary, per the statutory setting (capped).
  const pfWage = s?.pf_calc_base === 'basic' ? prorated.basic : proRataSalary;
  const pfBase = pfActive ? Math.min(pfWage, s?.pf_base_cap ?? pfWage) : 0;
  const pfEmployee = pfActive ? round2((pfBase * pfRateEmployee) / 100) : 0;
  const pfEmployer = pfActive ? round2((pfBase * pfRateEmployer) / 100) : 0;

  const esiOn = !!(s?.esi_enabled && esiEnrolled);
  const esiBase = s?.esi_calc_base === 'basic' ? prorated.basic : proRataSalary;
  // Eligibility is decided on the contractual MONTHLY wage vs the statutory
  // ceiling — NOT the pro-rated amount — so a mid-month joiner/leaver whose
  // monthly wage exceeds the ceiling stays ineligible. The deduction base
  // (esiBase) still pro-rates.
  const esiEligible = esiOn && monthlySalary <= (s?.esi_eligibility_ceiling ?? Infinity);
  const esiRateEmployee = esiEligible ? toAmount((cs as { esi_employee_rate?: number | null }).esi_employee_rate) : 0;
  const esiRateEmployer = esiEligible ? (s?.esi_employer_rate ?? 0) : 0;
  const esiEmployee = esiEligible ? round2((esiBase * esiRateEmployee) / 100) : 0;
  const esiEmployer = esiEligible ? round2((esiBase * esiRateEmployer) / 100) : 0;

  // ---- overtime ----
  const overtimeAuto = inp.overtimeAuto;
  const overtimeAmount = overtimeOverride !== null ? overtimeOverride : overtimeAuto;

  const loanEmiTotal = inp.loanEmis.reduce((sum, l) => sum + toAmount(l.amount), 0);

  const grossEarnings = proRataSalary + incentives + bonus + overtimeAmount;
  const ptAmount = computeProfessionalTax(cs, grossEarnings, s ?? undefined);

  const grossSalary = Math.max(0, grossEarnings - leaveDeduction - absentDeduction - disciplineFine - pfEmployee - esiEmployee - ptAmount);
  const advancesOutstanding = toAmount(inp.advancesOutstanding);
  const maxAdjustable = Math.min(advancesOutstanding, Math.max(0, grossSalary - loanEmiTotal));
  const currentAdj = Math.min(advanceToAdjust, maxAdjustable);
  const netPayable = applyRounding(Math.max(0, grossSalary - currentAdj - loanEmiTotal + inp.arrearsTotal), opts.rounding);
  const carryForwardAdvance = advancesOutstanding - currentAdj;

  return {
    monthlySalary: proRataSalary,
    basic: prorated.basic,
    hra: prorated.hra,
    allowances: prorated.allowances,
    incentives,
    bonus,
    overtimeAuto,
    overtimeAmount,
    dailySalary,
    systemDeductionDays: inp.systemDeductionDays,
    finalDeductionDays,
    leaveDeduction,
    absentDeductionDays,
    absentDeduction,
    presentDays: bd?.presentFull ?? 0,
    halfDays: bd?.presentHalf ?? 0,
    offDays: bd?.offDays ?? 0,
    paidLeaveDays: bd?.paidLeaveDays ?? 0,
    absentDays: bd?.absentDays ?? 0,
    compOffEarned,
    attendanceTracked,
    disciplineFine,
    pfEmployee, pfEmployer, pfBase, pfRateEmployee, pfRateEmployer,
    esiEmployee, esiEmployer, esiBase, esiRateEmployee, esiRateEmployer, esiEligible,
    ptAmount,
    loanEmis: inp.loanEmis,
    loanEmiTotal,
    grossSalary,
    advancesOutstanding,
    advanceToAdjust: currentAdj,
    netPayable,
    carryForwardAdvance,
    effectiveDays,
    arrears: inp.arrearsTotal,
  };
}

const FULL_DAY_MINUTES = 480;
const HALF_DAY_MINUTES = 240;

// ---------------------------------------------------------------------------
// Org-wide payroll configuration.
//
// These four reads return the SAME rows for every employee — pay rules and
// statutory settings are single config rows, and the holiday calendar is shared
// (holiday_assignments is filtered per staff in memory, not in SQL). Fetched
// inside the per-staff path they were re-requested once per employee: a 214-
// person run spent ~857 of its ~3,000 requests re-reading four rows.
//
// So a run fetches them ONCE and passes the result down. Kept as an explicit
// parameter rather than a module-level cache: payroll is the most
// consequential thing this app computes, and a hidden cache raises a staleness
// question (did this run see the rule I just edited?) that an explicit
// per-run fetch does not. Omit it and each call fetches for itself, exactly as
// before — the single-staff screen still does.
// ---------------------------------------------------------------------------
export interface PayrollRunConfig {
  statutory: StatutorySettings | null;
  payRules: PayRules | null;
  holidays: HolidayRow[];
  holidayAssignments: HolidayAssignmentRow[];
}

interface PayRules {
  full_day_minutes?: number;
  half_day_minutes?: number;
  unscheduled_is_off?: boolean;
  comp_off_enabled?: boolean;
}

const STATUTORY_COLUMNS =
  'pf_enabled, pf_employee_rate, pf_employer_rate, pf_base_cap, esi_enabled, esi_employer_rate, esi_eligibility_ceiling, pt_enabled, pt_monthly_amount, pt_min_gross, pt_slabs, ot_enabled, ot_standard_minutes, ot_multiplier';

/** Read the org-wide payroll config once, for a whole batch run. */
export async function fetchPayrollRunConfig(): Promise<PayrollRunConfig> {
  const [statRes, rulesRes, holRes, holAssignRes] = await Promise.all([
    supabase.from('payroll_statutory_settings').select(STATUTORY_COLUMNS).limit(1).maybeSingle(),
    supabase.from('hr_pay_rules' as never).select('full_day_minutes, half_day_minutes, unscheduled_is_off, comp_off_enabled').maybeSingle(),
    supabase.from('holidays').select('id, name, date, type, is_paid, recurring_yearly, org_wide'),
    supabase.from('holiday_assignments').select('holiday_id, outlet_id, staff_id'),
  ]);
  return {
    statutory: (statRes.data ?? null) as unknown as StatutorySettings | null,
    payRules: (rulesRes.data ?? null) as PayRules | null,
    holidays: (holRes.data ?? []) as unknown as HolidayRow[],
    holidayAssignments: (holAssignRes.data ?? []) as unknown as HolidayAssignmentRow[],
  };
}

// ---------------------------------------------------------------------------
// Per-staff data for a whole run, fetched in bulk.
//
// Every read below was previously issued once per employee with
// .eq('staff_id', x): nine of them, so a 214-person run made ~1,900 requests
// and took 74 seconds. They are the same queries with .in('staff_id', ids)
// instead — the filters, columns and date bounds are identical, so the rows a
// staff member gets out of the map are the rows their own query returned.
//
// This changes only WHERE computeSettlement's inputs come from. The formula
// itself is untouched; nothing in this file computes differently with a run
// bundle than without one, and omitting it falls back to the per-staff reads.
// ---------------------------------------------------------------------------
interface LeaveRow { leave_date: string; deduction_days: number | null }
interface AttendanceRow { work_date: string; worked_minutes: number | null; status: string }
interface RosterRow { roster_date: string; shift_id: string | null; is_off: boolean }
interface TemplateDay { start_date: string; end_date: string }

export interface PayrollRunData {
  config: PayrollRunConfig;
  salary: Map<string, number>;
  advances: Map<string, number>;
  leaves: Map<string, LeaveRow[]>;
  arrears: Map<string, number>;
  attendance: Map<string, AttendanceRow[]>;
  roster: Map<string, RosterRow[]>;
  discipline: Map<string, DisciplineLogRow[]>;
  loans: Map<string, StaffLoan[]>;
  /** Holiday-template days already resolved per staff member. */
  templateDays: Map<string, TemplateDay[]>;
}

/** Group rows by their staff_id into a Map, preserving order. */
function byStaff<T extends { staff_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.staff_id);
    if (list) list.push(r);
    else m.set(r.staff_id, [r]);
  }
  return m;
}

/**
 * Read every row of a bulk query, not just the first page.
 *
 * PostgREST caps a response at 1,000 rows. That cap is invisible — a truncated
 * result looks exactly like a complete one — and it bites precisely when a
 * per-staff query is replaced by one .in() query over everybody: August 2026
 * has 4,595 attendance rows across 214 staff, so an unpaged read returned the
 * first 1,000 and every employee after that computed as if they had never
 * attended. Each page is explicitly ordered so rows can't shift between
 * requests and be duplicated or skipped.
 */
const PAGE_SIZE = 1000;
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

/** Read everything a batch run needs for all of `staffIds`, in ~11 queries. */
export async function fetchPayrollRunData(staffIds: string[], month: string): Promise<PayrollRunData> {
  const monthStartStr = `${month}-01`;
  const monthStart = parseISO(monthStartStr);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const monthEndStr = `${month}-${String(monthEnd.getDate()).padStart(2, '0')}`;
  // getMonthlyDisciplineFine uses a half-open [start, nextMonth) window.
  const nextMonthStr = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    .toISOString().slice(0, 10);

  const [config, salRes, advRes, leaveRows, arrRows, attRows, rosRows, discRows, loanRows, tplRows] =
    await Promise.all([
      fetchPayrollRunConfig(),
      supabase.rpc('get_staff_salaries_for_month', { _staff_ids: staffIds, _month: month }),
      supabase.rpc('get_staff_advances_from_journals_bulk', { _staff_ids: staffIds }),
      fetchAllPages<LeaveRow & { staff_id: string }>((f, t) =>
        supabase.from('leave_records').select('staff_id, leave_date, deduction_days').in('staff_id', staffIds).eq('status', 'approved').gte('leave_date', monthStartStr).lte('leave_date', monthEndStr).order('staff_id').order('leave_date').range(f, t)),
      fetchAllPages<{ staff_id: string; amount: number | null }>((f, t) =>
        supabase.from('salary_arrears').select('staff_id, amount').in('staff_id', staffIds).eq('settlement_month', month).eq('status', 'pending').order('staff_id').order('id').range(f, t)),
      fetchAllPages<AttendanceRow & { staff_id: string }>((f, t) =>
        supabase.from('attendance_sessions').select('staff_id, work_date, worked_minutes, status').in('staff_id', staffIds).gte('work_date', monthStartStr).lte('work_date', monthEndStr).order('staff_id').order('work_date').order('id').range(f, t)),
      fetchAllPages<RosterRow & { staff_id: string }>((f, t) =>
        supabase.from('staff_roster').select('staff_id, roster_date, shift_id, is_off').in('staff_id', staffIds).gte('roster_date', monthStartStr).lte('roster_date', monthEndStr).order('staff_id').order('roster_date').range(f, t)),
      fetchAllPages<DisciplineLogRow & { staff_id: string }>((f, t) =>
        supabase.from('attendance_discipline_log' as never).select('*').in('staff_id', staffIds).gte('work_date', monthStartStr).lt('work_date', nextMonthStr).order('staff_id').order('work_date').range(f, t)),
      fetchAllPages<StaffLoan & { staff_id: string }>((f, t) =>
        supabase.from('staff_loans').select('*').in('staff_id', staffIds).eq('status', 'active').order('staff_id').order('id').range(f, t)),
      fetchAllPages<{ staff_id: string; template_id: string | null }>((f, t) =>
        anyDb.from('employee_holiday_template').select('staff_id, template_id').in('staff_id', staffIds).order('staff_id').range(f, t)),
    ]);

  // Holiday templates: one extra query for the distinct templates in use,
  // then mapped back onto the staff who use them.
  const templateIds = [...new Set(tplRows.map((r) => r.template_id).filter((x): x is string => !!x))];
  const templateDays = new Map<string, TemplateDay[]>();
  if (templateIds.length) {
    const days = await fetchAllPages<{ template_id: string; start_date: string; end_date: string }>((f, t) =>
      anyDb.from('holiday_template_days').select('template_id, start_date, end_date').in('template_id', templateIds).order('template_id').order('start_date').range(f, t));
    const daysByTemplate = new Map<string, TemplateDay[]>();
    for (const d of days) {
      const list = daysByTemplate.get(d.template_id);
      if (list) list.push(d);
      else daysByTemplate.set(d.template_id, [d]);
    }
    for (const r of tplRows) {
      if (r.template_id) templateDays.set(r.staff_id, daysByTemplate.get(r.template_id) ?? []);
    }
  }

  const arrears = new Map<string, number>();
  for (const r of arrRows) arrears.set(r.staff_id, (arrears.get(r.staff_id) ?? 0) + Number(r.amount ?? 0));

  return {
    config,
    salary: new Map(((salRes.data ?? []) as { staff_id: string; salary: number }[]).map((r) => [r.staff_id, Number(r.salary)])),
    advances: new Map(((advRes.data ?? []) as { staff_id: string; advances: number }[]).map((r) => [r.staff_id, Number(r.advances)])),
    leaves: byStaff(leaveRows),
    arrears,
    attendance: byStaff(attRows),
    roster: byStaff(rosRows),
    discipline: byStaff(discRows),
    loans: byStaff(loanRows),
    templateDays,
  };
}

/** Fetch + sub-compute everything computeSettlement needs for one staff/month. */
export async function gatherSettlementInputs(
  staff: Staff,
  month: string,
  opts?: { statutory?: StatutorySettings | null; config?: PayrollRunConfig; run?: PayrollRunData },
): Promise<SettlementInputs> {
  const monthStartStr = `${month}-01`;
  const monthStart = parseISO(monthStartStr);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const monthEndStr = `${month}-${String(monthEnd.getDate()).padStart(2, '0')}`;

  // With a run bundle these four are already in memory; without one they are
  // fetched exactly as before. Note the single leave read: the attendance block
  // below needs the same rows (same staff, month, approved) and used to fetch
  // them a second time just for leave_date — 214 duplicate requests on a full
  // run. Selecting both columns once serves both uses.
  const run = opts?.run;
  let leaveRows: LeaveRow[];
  let monthlySalary: number;
  let advancesOutstanding: number;
  let arrearsTotal: number;

  if (run) {
    leaveRows = run.leaves.get(staff.id) ?? [];
    monthlySalary = toAmount(run.salary.get(staff.id) ?? 0);
    advancesOutstanding = toAmount(run.advances.get(staff.id) ?? 0);
    arrearsTotal = run.arrears.get(staff.id) ?? 0;
  } else {
    const [salaryRes, advanceRes, leaveRes, arrearsRes] = await Promise.all([
      supabase.rpc('get_staff_salary_for_month', { _staff_id: staff.id, _month: month }),
      supabase.rpc('get_staff_advances_from_journals', { _staff_id: staff.id }),
      supabase.from('leave_records').select('leave_date, deduction_days').eq('staff_id', staff.id).eq('status', 'approved').gte('leave_date', monthStartStr).lte('leave_date', monthEndStr),
      supabase.from('salary_arrears').select('amount').eq('staff_id', staff.id).eq('settlement_month', month).eq('status', 'pending'),
    ]);
    leaveRows = (leaveRes.data ?? []) as LeaveRow[];
    monthlySalary = toAmount(salaryRes.data);
    advancesOutstanding = toAmount(advanceRes.data);
    arrearsTotal = ((arrearsRes.data ?? []) as { amount: number | null }[]).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  }

  const systemDeductionDays = leaveRows.reduce((sum, r) => sum + Number(r.deduction_days ?? 0), 0);

  let statutory = opts?.statutory ?? opts?.config?.statutory ?? run?.config.statutory ?? null;
  if (statutory === undefined || statutory === null) {
    const { data } = await supabase
      .from('payroll_statutory_settings')
      .select(STATUTORY_COLUMNS)
      .limit(1)
      .maybeSingle();
    statutory = (data ?? null) as unknown as StatutorySettings | null;
  }

  const attendanceTracked = (staff as { attendance_tracked?: boolean }).attendance_tracked !== false;

  let dayBreakdown: DayBreakdown | null = null;
  let compOffEnabled = true;
  let disciplineFine = 0;

  if (attendanceTracked) {
    const disciplineFinedDates = new Set<string>();
    try {
      const logs = run
        ? (run.discipline.get(staff.id) ?? [])
        : (await getMonthlyDisciplineFine(staff.id, month, monthlySalary)).logs;
      disciplineFine = sumDisciplineFine(logs);
      for (const l of logs) {
        if (!l.is_cancelled && !l.is_absent && Number(l.fine_amount) > 0) disciplineFinedDates.add(l.work_date);
      }
    } catch (e) {
      console.error('Discipline fine compute failed', e);
    }

    // Per-staff rows come from the run bundle when there is one. Pay rules and
    // the holiday calendar come from the run config. Without either, everything
    // is fetched here exactly as before — the single-staff screen is unchanged.
    const cfg = opts?.config ?? run?.config;
    const [attRes, rosRes, rulesRes, holRes, holAssignRes] = await Promise.all([
      run
        ? Promise.resolve({ data: run.attendance.get(staff.id) ?? [] })
        : supabase.from('attendance_sessions').select('work_date, worked_minutes, status').eq('staff_id', staff.id).gte('work_date', monthStartStr).lte('work_date', monthEndStr),
      run
        ? Promise.resolve({ data: run.roster.get(staff.id) ?? [] })
        : supabase.from('staff_roster').select('roster_date, shift_id, is_off').eq('staff_id', staff.id).gte('roster_date', monthStartStr).lte('roster_date', monthEndStr),
      cfg
        ? Promise.resolve({ data: cfg.payRules })
        : supabase.from('hr_pay_rules' as never).select('full_day_minutes, half_day_minutes, unscheduled_is_off, comp_off_enabled').maybeSingle(),
      cfg
        ? Promise.resolve({ data: cfg.holidays })
        : supabase.from('holidays').select('id, name, date, type, is_paid, recurring_yearly, org_wide'),
      cfg
        ? Promise.resolve({ data: cfg.holidayAssignments })
        : supabase.from('holiday_assignments').select('holiday_id, outlet_id, staff_id'),
    ]);
    const payRules = (rulesRes.data ?? null) as PayRules | null;
    compOffEnabled = payRules?.comp_off_enabled ?? true;
    let holidayDates = resolveHolidayDatesForStaff(
      { id: staff.id, outlet_id: (staff as { outlet_id?: string | null }).outlet_id ?? null },
      (holRes.data ?? []) as unknown as HolidayRow[],
      (holAssignRes.data ?? []) as unknown as HolidayAssignmentRow[],
      monthStartStr, monthEndStr,
    );
    // Fold any assigned holiday-TEMPLATE dates into the paid-day set (Leaves module).
    try {
      let tdays: TemplateDay[] | null = run ? (run.templateDays.get(staff.id) ?? []) : null;
      if (!run) {
        const { data: eht } = await anyDb.from('employee_holiday_template').select('template_id').eq('staff_id', staff.id).maybeSingle();
        const templateId = (eht as { template_id?: string } | null)?.template_id;
        tdays = templateId
          ? ((await anyDb.from('holiday_template_days').select('start_date, end_date').eq('template_id', templateId)).data ?? []) as TemplateDay[]
          : [];
      }
      if (tdays && tdays.length) {
        holidayDates = mergeTemplateHolidays(holidayDates, tdays, monthStartStr, monthEndStr);
      }
    } catch (e) { console.error('Holiday template resolution failed', e); }
    dayBreakdown = computeDayBreakdown({
      monthStart,
      monthEnd,
      dateOfJoining: staff.date_of_joining,
      dateOfLeaving: staff.date_of_leaving ?? null,
      weeklyOffDay: (staff as { weekly_off_day?: number | null }).weekly_off_day ?? null,
      fullDayMinutes: payRules?.full_day_minutes ?? FULL_DAY_MINUTES,
      halfDayMinutes: payRules?.half_day_minutes ?? HALF_DAY_MINUTES,
      unscheduledIsOff: payRules?.unscheduled_is_off ?? true,
      disciplineFinedDates,
      holidayDates,
      attendance: attRes.data ?? [],
      roster: rosRes.data ?? [],
      leaves: leaveRows,
    });
  }

  const fullStructure = getStaffStructure(staff);
  const otEnabled = statutory?.ot_enabled !== false;
  const otStd = (staff as { ot_standard_minutes_override?: number | null }).ot_standard_minutes_override ?? statutory?.ot_standard_minutes ?? 480;
  const otMult = (staff as { ot_multiplier_override?: number | null }).ot_multiplier_override ?? statutory?.ot_multiplier ?? 1.5;
  const overtimeAuto = attendanceTracked && otEnabled
    ? await computeAutoOvertime({
        staffId: staff.id, month, basic: fullStructure.basic,
        daysInMonth: getDaysInMonth(monthStart), scheduledMinutesPerDay: otStd, multiplier: otMult,
        // Same rows the day-breakdown used; saves re-reading them per employee.
        sessions: run ? (run.attendance.get(staff.id) ?? []) : undefined,
      })
    : 0;

  const loanEmis = run
    ? loanEmisFromRows(run.loans.get(staff.id) ?? [], month)
    : await getLoanEMIsForMonth(staff.id, month);

  return { staff, month, monthlySalary, advancesOutstanding, statutory, dayBreakdown, attendanceTracked, compOffEnabled, disciplineFine, systemDeductionDays, overtimeAuto, loanEmis, arrearsTotal };
}

export async function isMonthSettled(staffId: string, month: string): Promise<boolean> {
  const { data } = await supabase.rpc('is_salary_settled', { _staff_id: staffId, _month: month });
  return !!data;
}

/**
 * Persist a computed settlement — posts the accrual journal (reusing the shared
 * helper), inserts the settled salary_settlements row, and queues a salary
 * payout request. Mirrors the per-staff screen's finalize writes.
 */
export async function persistGroupSettlement(
  calc: SettlementResult,
  ctx: {
    staff: Staff;
    month: string;
    userId: string;
    approverName: string;
    /** Reason for a manual overtime override (per-staff screen). */
    overtimeOverrideReason?: string | null;
    /** Reason for adjusting deduction days away from the system value. */
    deductionAdjustmentReason?: string | null;
    /** Explicit absent-days override applied (audit trail). */
    absentDaysOverride?: number | null;
  },
): Promise<string> {
  const { staff, month, userId } = ctx;
  const monthLabel = parseISO(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Idempotency: never double-post for an already-settled month.
  if (await isMonthSettled(staff.id, month)) {
    throw new Error(`${staff.full_name}: salary for ${monthLabel} is already settled`);
  }

  // Reserve the unique (staff, month) slot BEFORE posting any immutable journal,
  // so a duplicate is rejected by the constraint with no orphan ledger entry.
  const { data: settlementRecord, error } = await supabase
    .from('salary_settlements')
    .insert({
      staff_id: staff.id,
      settlement_month: month,
      base_salary: calc.monthlySalary,
      leave_days: calc.finalDeductionDays,
      leave_deduction: calc.leaveDeduction,
      absent_deduction_days: calc.absentDeductionDays,
      absent_deduction: calc.absentDeduction,
      present_days: calc.presentDays,
      half_days: calc.halfDays,
      off_days: calc.offDays,
      paid_leave_days: calc.paidLeaveDays,
      absent_days: calc.absentDays,
      comp_off_earned: calc.compOffEarned,
      net_salary: calc.grossSalary,
      advances_adjusted: calc.advanceToAdjust,
      opening_advance_balance: calc.advancesOutstanding,
      closing_advance_balance: calc.carryForwardAdvance,
      balance_payable: calc.netPayable,
      arrears: calc.arrears,
      status: 'settled',
      settled_at: new Date().toISOString(),
      settled_by: userId,
      journal_entry_id: null,
      system_deduction_days: calc.systemDeductionDays,
      final_deduction_days: calc.finalDeductionDays,
      deduction_adjustment_reason: ctx.deductionAdjustmentReason || null,
      deduction_adjusted_by: calc.finalDeductionDays !== calc.systemDeductionDays ? userId : null,
      deduction_adjusted_at: calc.finalDeductionDays !== calc.systemDeductionDays ? new Date().toISOString() : null,
      absent_days_override: calc.attendanceTracked ? (ctx.absentDaysOverride ?? null) : null,
      // Itemised snapshot — the payslip renders from these columns. (They were
      // added with DEFAULT 0 and previously had NO writer, so itemised slips
      // silently fell back to the single "Earned Salary" row.)
      earnings_basic: calc.basic,
      earnings_hra: calc.hra,
      earnings_allowances: calc.allowances,
      incentives: calc.incentives,
      bonus: calc.bonus,
      overtime_amount: calc.overtimeAmount,
      overtime_auto: calc.overtimeAuto,
      overtime_override_reason: ctx.overtimeOverrideReason || null,
      pt_amount: calc.ptAmount,
      loan_emi_total: calc.loanEmiTotal,
      discipline_fine: calc.disciplineFine,
      pf_employee: calc.pfEmployee,
      pf_employer: calc.pfEmployer,
      esi_employee: calc.esiEmployee,
      esi_employer: calc.esiEmployer,
      pf_rate_employee: calc.pfRateEmployee || null,
      pf_rate_employer: calc.pfRateEmployer || null,
      esi_rate_employee: calc.esiRateEmployee || null,
      esi_rate_employer: calc.esiRateEmployer || null,
      pf_base: calc.pfBase || null,
      esi_base: calc.esiBase || null,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;

  // Post the (immutable) settlement journal now that the slot is reserved. If it
  // fails, roll back the reserved row so a retry is clean — no orphan journal.
  let journalEntryId: string;
  try {
    journalEntryId = await createSalarySettlementEntry({
      staffId: staff.id,
      staffName: staff.full_name,
      settlementMonth: monthLabel,
      grossSalary: calc.grossSalary,
      leaveDeduction: calc.leaveDeduction,
      advanceAdjustment: calc.advanceToAdjust,
      pfEmployee: calc.pfEmployee,
      pfEmployer: calc.pfEmployer,
      esiEmployee: calc.esiEmployee,
      esiEmployer: calc.esiEmployer,
      ptAmount: calc.ptAmount,
      loanEmiTotal: calc.loanEmiTotal,
      bonus: calc.bonus,
      overtimeAmount: calc.overtimeAmount,
      settlementId: settlementRecord.id,
      createdBy: userId,
    });
  } catch (e) {
    await supabase.from('salary_settlements').delete().eq('id', settlementRecord.id);
    throw e;
  }
  await supabase.from('salary_settlements').update({ journal_entry_id: journalEntryId }).eq('id', settlementRecord.id);

  // Arrears: post a balanced entry only when there's a net to move, but ALWAYS mark
  // the month's pending arrears settled — zero-sum arrears (e.g. +500 / −500) must
  // not stay pending forever against an already-settled month.
  if (Math.abs(calc.arrears) >= 0.01) {
    await createArrearsEntry({ staffId: staff.id, staffName: staff.full_name, amount: calc.arrears, settlementMonth: monthLabel, settlementId: settlementRecord.id, createdBy: userId });
  }
  await supabase.from('salary_arrears').update({ status: 'settled', settlement_id: settlementRecord.id, settled_at: new Date().toISOString() })
    .eq('staff_id', staff.id).eq('settlement_month', month).eq('status', 'pending');

  // Record per-loan recoveries and reduce balances (PHASE 6). Loans whose
  // balance reaches zero close. This was the missing half of loan recovery:
  // the journal deducted the EMI but nothing ever decremented
  // staff_loans.remaining_balance, so an EMI would deduct forever.
  for (const emi of calc.loanEmis) {
    try {
      const amount = toAmount(emi.amount);
      if (amount <= 0) continue;
      await supabase.from('salary_settlement_loan_deductions').insert({
        settlement_id: settlementRecord.id,
        loan_id: emi.loan.id,
        amount,
      } as never);
      const remaining = Math.max(0, toAmount(emi.loan.remaining_balance) - amount);
      await supabase
        .from('staff_loans')
        .update({ remaining_balance: remaining, ...(remaining <= 0 ? { status: 'closed' } : {}) } as never)
        .eq('id', emi.loan.id);
    } catch (e) {
      // The journal already carries the deduction; a tracking failure must not
      // roll back a posted settlement. Surface it for reconciliation instead.
      console.error('Loan recovery tracking failed for loan', emi.loan.id, e);
    }
  }

  // Freeze the month's approved leave records — mirrors the per-staff screen.
  const monthStartStr = `${month}-01`;
  const monthEndDate = new Date(parseISO(monthStartStr).getFullYear(), parseISO(monthStartStr).getMonth() + 1, 0);
  const monthEndStr = `${month}-${String(monthEndDate.getDate()).padStart(2, '0')}`;
  await supabase
    .from('leave_records')
    .update({ is_immutable: true })
    .eq('staff_id', staff.id)
    .eq('status', 'approved')
    .gte('leave_date', monthStartStr)
    .lte('leave_date', monthEndStr);

  if (calc.netPayable > 0) {
    const { error: payoutErr } = await supabase.from('payment_requests').insert({
      staff_id: staff.id,
      requested_by: userId,
      amount: calc.netPayable,
      reason: `Salary for ${monthLabel}`,
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      approved_by_user_name: ctx.approverName,
      payout_type: 'salary',
      settlement_id: settlementRecord.id,
    });
    if (payoutErr) throw payoutErr;
  }

  return settlementRecord.id;
}
