/**
 * Payroll helpers: salary structure, professional tax, loan EMIs, overtime.
 * All calculations are pure — caller composes them into a settlement.
 */
import { supabase } from '@/integrations/supabase/client';
import { getDaysInMonth, parseISO } from 'date-fns';
import type { Staff, StaffLoan } from '@/types/database';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface StructureBreakdown {
  basic: number;
  hra: number;
  allowances: number;
  /** Sum of the three fixed components (the contractual monthly salary). */
  contractualTotal: number;
}

/**
 * Returns the fixed structure for a staff member. If structure fields are
 * unset (legacy staff), the whole monthly_salary is treated as Basic so
 * downstream PF/ESI bases keep working.
 */
export function getStaffStructure(staff: Partial<Staff>): StructureBreakdown {
  const basic = Number(staff.basic_salary ?? 0);
  const hra = Number(staff.hra ?? 0);
  const allowances = Number(staff.other_allowances ?? 0);
  const contractualTotal = basic + hra + allowances;
  if (contractualTotal === 0) {
    const fallback = Number(staff.monthly_salary ?? 0);
    return {
      basic: fallback,
      hra: 0,
      allowances: 0,
      contractualTotal: fallback,
    };
  }
  return { basic, hra, allowances, contractualTotal };
}

/**
 * Pro-rates a structure breakdown for partial-month attendance.
 */
export function prorateStructure(
  structure: StructureBreakdown,
  effectiveDays: number,
  daysInMonth: number,
): StructureBreakdown {
  const factor = daysInMonth > 0 ? effectiveDays / daysInMonth : 1;
  return {
    basic: round2(structure.basic * factor),
    hra: round2(structure.hra * factor),
    allowances: round2(structure.allowances * factor),
    contractualTotal: round2(structure.contractualTotal * factor),
  };
}

// ---------- Professional Tax ----------

/** One row of a slab-based Professional Tax table. `upTo` is the inclusive upper
 *  bound on monthly gross; `null` means the top slab (no upper limit). */
export interface PTSlab {
  upTo: number | null;
  amount: number;
}

export interface PTConfig {
  pt_enabled?: boolean;
  pt_monthly_amount?: number;
  pt_min_gross?: number;
  pt_slabs?: PTSlab[] | null;
}

export function computeProfessionalTax(
  staff: Partial<Staff>,
  grossEarnings: number,
  config: PTConfig | null | undefined,
): number {
  if (!config?.pt_enabled) return 0;
  if (staff.pt_exempt) return 0;

  // Preferred: slab-based PT (e.g. West Bengal monthly slabs by gross).
  const slabs = config.pt_slabs;
  if (Array.isArray(slabs) && slabs.length > 0) {
    const sorted = [...slabs].sort((a, b) => {
      const au = a.upTo == null ? Infinity : Number(a.upTo);
      const bu = b.upTo == null ? Infinity : Number(b.upTo);
      return au - bu;
    });
    for (const slab of sorted) {
      const cap = slab.upTo == null ? Infinity : Number(slab.upTo);
      if (grossEarnings <= cap) return Number(slab.amount ?? 0);
    }
    return Number(sorted[sorted.length - 1]?.amount ?? 0);
  }

  // Legacy fallback: flat amount above a threshold.
  const minGross = Number(config.pt_min_gross ?? 0);
  if (grossEarnings < minGross) return 0;
  return Number(config.pt_monthly_amount ?? 0);
}

// ---------- Overtime ----------

interface OvertimeInput {
  staffId: string;
  month: string;       // YYYY-MM
  basic: number;       // contractual monthly basic (pre-prorata)
  daysInMonth: number;
  scheduledMinutesPerDay?: number; // defaults to 480 (8h)
  multiplier?: number; // defaults to 1.5x
}

/**
 * Sum (worked_minutes − scheduled_minutes) across the month and convert to ₹
 * using Basic-only hourly rate × 1.5x. Returns 0 if attendance is untracked
 * or no extra minutes were worked.
 */
export async function computeAutoOvertime(input: OvertimeInput): Promise<number> {
  const scheduledMinutesPerDay = input.scheduledMinutesPerDay ?? 480;
  const multiplier = input.multiplier ?? 1.5;
  const monthStart = `${input.month}-01`;
  const ms = parseISO(monthStart);
  const monthEnd = new Date(ms.getFullYear(), ms.getMonth() + 1, 0)
    .toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('worked_minutes, status, work_date')
    .eq('staff_id', input.staffId)
    .gte('work_date', monthStart)
    .lte('work_date', monthEnd);
  if (error || !data) return 0;

  let extraMinutes = 0;
  for (const session of data) {
    const worked = Number(session.worked_minutes ?? 0);
    if (worked <= scheduledMinutesPerDay) continue;
    extraMinutes += worked - scheduledMinutesPerDay;
  }
  if (extraMinutes <= 0) return 0;

  const hourlyBasic = input.basic / (input.daysInMonth * (scheduledMinutesPerDay / 60));
  return round2((extraMinutes / 60) * hourlyBasic * multiplier);
}

// ---------- Loan EMIs ----------

export interface LoanEMI {
  loan: StaffLoan;
  amount: number;
}

/**
 * For an active loan, the EMI to deduct this month is the lesser of the
 * configured EMI and the remaining balance. Loans whose start_month is in
 * the future are skipped.
 */
export async function getLoanEMIsForMonth(
  staffId: string,
  month: string,
): Promise<LoanEMI[]> {
  const { data, error } = await supabase
    .from('staff_loans')
    .select('*')
    .eq('staff_id', staffId)
    .eq('status', 'active');
  if (error || !data) return [];
  const out: LoanEMI[] = [];
  for (const row of data as unknown as StaffLoan[]) {
    if (row.start_month > month) continue;
    if (row.remaining_balance <= 0) continue;
    const amount = Math.min(Number(row.emi_amount), Number(row.remaining_balance));
    if (amount > 0) out.push({ loan: row, amount: round2(amount) });
  }
  return out;
}

export function daysIn(month: string) {
  return getDaysInMonth(parseISO(`${month}-01`));
}
