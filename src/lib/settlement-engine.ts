// ============================================================================
// Settlement engine (extracted from Settlements.tsx for batch reuse).
//
//   computeSettlement(inputs, opts)  -> PURE salary math (unit-tested).
//   gatherSettlementInputs(staff, m) -> async fetch of everything it needs.
//   persistGroupSettlement(calc, …)  -> writes the journal + settlement + payout
//                                        request (reuses the SAME journal helper
//                                        the per-staff screen uses).
//
// IMPORTANT: computeSettlement faithfully mirrors the per-staff screen's
// system-default math. It is the basis of the batch group settlement. The
// single-staff screen has NOT yet been refactored onto it (so its behaviour is
// untouched); unify once verified on a real deploy.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';
import { getDaysInMonth, parseISO } from 'date-fns';
import { toAmount } from '@/lib/utils';
import { computeDayBreakdown, type DayBreakdown } from '@/lib/attendance-pay';
import { resolveHolidayDatesForStaff, type HolidayRow, type HolidayAssignmentRow } from '@/lib/holidays';
import {
  getStaffStructure, prorateStructure, computeProfessionalTax, computeAutoOvertime,
  getLoanEMIsForMonth, type LoanEMI, type PTSlab,
} from '@/lib/payroll';
import { getMonthlyDisciplineFine } from '@/lib/discipline';
import { createSalarySettlementEntry, createArrearsEntry } from '@/lib/journal-entries';
import { supabase as anyDb } from '@/integrations/supabase/anyClient';
import { mergeTemplateHolidays } from '@/lib/leave-allocation';
import type { Staff } from '@/types/database';

export interface StatutorySettings {
  pf_enabled: boolean;
  pf_employee_rate: number;
  pf_employer_rate: number;
  pf_base_cap: number;
  esi_enabled: boolean;
  esi_employer_rate: number;
  esi_eligibility_ceiling: number;
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
  const pfBase = pfActive ? Math.min(proRataSalary, s?.pf_base_cap ?? proRataSalary) : 0;
  const pfEmployee = pfActive ? round2((pfBase * pfRateEmployee) / 100) : 0;
  const pfEmployer = pfActive ? round2((pfBase * pfRateEmployer) / 100) : 0;

  const esiOn = !!(s?.esi_enabled && esiEnrolled);
  const esiBase = proRataSalary;
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

/** Fetch + sub-compute everything computeSettlement needs for one staff/month. */
export async function gatherSettlementInputs(
  staff: Staff,
  month: string,
  opts?: { statutory?: StatutorySettings | null },
): Promise<SettlementInputs> {
  const monthStartStr = `${month}-01`;
  const monthStart = parseISO(monthStartStr);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const monthEndStr = `${month}-${String(monthEnd.getDate()).padStart(2, '0')}`;

  const [salaryRes, advanceRes, leaveRes, arrearsRes] = await Promise.all([
    supabase.rpc('get_staff_salary_for_month', { _staff_id: staff.id, _month: month }),
    supabase.rpc('get_staff_advances_from_journals', { _staff_id: staff.id }),
    supabase.from('leave_records').select('deduction_days').eq('staff_id', staff.id).eq('status', 'approved').gte('leave_date', monthStartStr).lte('leave_date', monthEndStr),
    supabase.from('salary_arrears').select('amount').eq('staff_id', staff.id).eq('settlement_month', month).eq('status', 'pending'),
  ]);

  const monthlySalary = toAmount(salaryRes.data);
  const advancesOutstanding = toAmount(advanceRes.data);
  const systemDeductionDays = ((leaveRes.data ?? []) as { deduction_days: number | null }[]).reduce((sum, r) => sum + Number(r.deduction_days ?? 0), 0);
  const arrearsTotal = ((arrearsRes.data ?? []) as { amount: number | null }[]).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  let statutory = opts?.statutory ?? null;
  if (statutory === undefined || statutory === null) {
    const { data } = await supabase
      .from('payroll_statutory_settings')
      .select('pf_enabled, pf_employee_rate, pf_employer_rate, pf_base_cap, esi_enabled, esi_employer_rate, esi_eligibility_ceiling, pt_enabled, pt_monthly_amount, pt_min_gross, pt_slabs, ot_enabled, ot_standard_minutes, ot_multiplier')
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
      const { totalFine, logs } = await getMonthlyDisciplineFine(staff.id, month, monthlySalary);
      disciplineFine = totalFine;
      for (const l of logs) {
        if (!l.is_cancelled && !l.is_absent && Number(l.fine_amount) > 0) disciplineFinedDates.add(l.work_date);
      }
    } catch (e) {
      console.error('Discipline fine compute failed', e);
    }

    const [attRes, rosRes, lvRes, rulesRes, holRes, holAssignRes] = await Promise.all([
      supabase.from('attendance_sessions').select('work_date, worked_minutes, status').eq('staff_id', staff.id).gte('work_date', monthStartStr).lte('work_date', monthEndStr),
      supabase.from('staff_roster').select('roster_date, shift_id, is_off').eq('staff_id', staff.id).gte('roster_date', monthStartStr).lte('roster_date', monthEndStr),
      supabase.from('leave_records').select('leave_date, deduction_days').eq('staff_id', staff.id).eq('status', 'approved').gte('leave_date', monthStartStr).lte('leave_date', monthEndStr),
      supabase.from('hr_pay_rules' as never).select('full_day_minutes, half_day_minutes, unscheduled_is_off, comp_off_enabled').maybeSingle(),
      supabase.from('holidays').select('id, name, date, type, is_paid, recurring_yearly, org_wide'),
      supabase.from('holiday_assignments').select('holiday_id, outlet_id, staff_id'),
    ]);
    const payRules = (rulesRes.data ?? null) as { full_day_minutes?: number; half_day_minutes?: number; unscheduled_is_off?: boolean; comp_off_enabled?: boolean } | null;
    compOffEnabled = payRules?.comp_off_enabled ?? true;
    let holidayDates = resolveHolidayDatesForStaff(
      { id: staff.id, outlet_id: (staff as { outlet_id?: string | null }).outlet_id ?? null },
      (holRes.data ?? []) as unknown as HolidayRow[],
      (holAssignRes.data ?? []) as unknown as HolidayAssignmentRow[],
      monthStartStr, monthEndStr,
    );
    // Fold any assigned holiday-TEMPLATE dates into the paid-day set (Leaves module).
    try {
      const { data: eht } = await anyDb.from('employee_holiday_template').select('template_id').eq('staff_id', staff.id).maybeSingle();
      const templateId = (eht as { template_id?: string } | null)?.template_id;
      if (templateId) {
        const { data: tdays } = await anyDb.from('holiday_template_days').select('start_date, end_date').eq('template_id', templateId);
        holidayDates = mergeTemplateHolidays(holidayDates, (tdays ?? []) as { start_date: string; end_date: string }[], monthStartStr, monthEndStr);
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
      leaves: lvRes.data ?? [],
    });
  }

  const fullStructure = getStaffStructure(staff);
  const otEnabled = statutory?.ot_enabled !== false;
  const otStd = (staff as { ot_standard_minutes_override?: number | null }).ot_standard_minutes_override ?? statutory?.ot_standard_minutes ?? 480;
  const otMult = (staff as { ot_multiplier_override?: number | null }).ot_multiplier_override ?? statutory?.ot_multiplier ?? 1.5;
  const overtimeAuto = attendanceTracked && otEnabled
    ? await computeAutoOvertime({ staffId: staff.id, month, basic: fullStructure.basic, daysInMonth: getDaysInMonth(monthStart), scheduledMinutesPerDay: otStd, multiplier: otMult })
    : 0;

  const loanEmis = await getLoanEMIsForMonth(staff.id, month);

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
  ctx: { staff: Staff; month: string; userId: string; approverName: string },
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
