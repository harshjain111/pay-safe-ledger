import { supabase } from '@/integrations/supabase/anyClient';
import { fetchMaster } from '@/lib/masters-cache';

// ---------------------------------------------------------------------------
// The monthly salary register — the sheet the accountant currently keeps by
// hand ("KONNECT AUG 26.xlsx"): one row per employee, attendance on the left,
// the earnings split, statutory deductions, net pay, and the employer's own
// contributions on the right, with a totals row at the foot.
//
// The column set and the order are deliberately theirs, not ours, so the file
// this produces can replace the one they build manually without anybody having
// to relearn where a number lives. Every figure comes from salary_settlements,
// which is what payroll already writes — this reads, it does not recompute, so
// the register and the payslips can never disagree.
// ---------------------------------------------------------------------------

export interface RegisterRow {
  slNo: number;
  name: string;
  outlet: string;
  designation: string;
  workingDays: number;
  present: number;
  absent: number;
  remainingLeaves: number | null;
  actualSalary: number;
  gross: number;
  basic: number;
  hra: number;
  otherAllowance: number;
  pfEmployee: number;
  esiEmployee: number;
  pTax: number;
  tds: number;
  advance: number;
  totalDeductions: number;
  net: number;
  pfEmployer: number;
  esiEmployer: number;
  totalEmployerContribution: number;
}

export interface SalaryRegister {
  month: string;
  rows: RegisterRow[];
  totals: Omit<RegisterRow, 'slNo' | 'name' | 'outlet' | 'designation' | 'remainingLeaves'> & {
    remainingLeaves: null;
  };
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Days in the month, which is what the sheet calls "total no of working days". */
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

interface SettlementLike {
  staff_id: string;
  base_salary: number | null;
  present_days: number | null;
  half_days: number | null;
  absent_days: number | null;
  paid_leave_days: number | null;
  earnings_basic: number | null;
  earnings_hra: number | null;
  earnings_allowances: number | null;
  incentives: number | null;
  bonus: number | null;
  overtime_amount: number | null;
  arrears: number | null;
  pf_employee: number | null;
  pf_employer: number | null;
  esi_employee: number | null;
  esi_employer: number | null;
  pt_amount: number | null;
  advances_adjusted: number | null;
  loan_emi_total: number | null;
  discipline_fine: number | null;
  net_salary: number | null;
  staff: {
    full_name: string | null;
    employee_id: string | null;
    department: string | null;
    designation: string | null;
    outlet_id: string | null;
  } | null;
}

/**
 * Reads one month's register. Returns rows in the sheet's own order —
 * outlet, then name — with a totals row computed from the rows themselves so
 * the foot of the file always adds up to what is above it.
 */
export async function fetchSalaryRegister(month: string): Promise<SalaryRegister> {
  const [{ data, error }, outlets] = await Promise.all([
    supabase
      .from('salary_settlements')
      .select(
        'staff_id, base_salary, present_days, half_days, absent_days, paid_leave_days,' +
        ' earnings_basic, earnings_hra, earnings_allowances, incentives, bonus, overtime_amount,' +
        ' arrears, pf_employee, pf_employer, esi_employee, esi_employer, pt_amount,' +
        ' advances_adjusted, loan_emi_total, discipline_fine, net_salary,' +
        ' staff:staff_id ( full_name, employee_id, department, designation, outlet_id )',
      )
      .eq('settlement_month', month),
    fetchMaster('outlets').catch(() => []),
  ]);
  if (error) throw error;

  const outletName = new Map((outlets ?? []).map((o) => [o.id, o.name]));
  const days = daysInMonth(month);

  const rows: RegisterRow[] = ((data ?? []) as unknown as SettlementLike[])
    .map((s) => {
      const st = s.staff;
      // Their OUTLET column reads "SY - SERVICE STAFF": the outlet and the
      // department together. Ours are two fields, so compose them.
      const outlet = [outletName.get(st?.outlet_id ?? '') ?? '', st?.department ?? '']
        .filter(Boolean)
        .join(' - ');

      const basic = n(s.earnings_basic);
      const hra = n(s.earnings_hra);
      const other = n(s.earnings_allowances);
      // Gross is what was actually earned for the month: the pro-rated
      // structure plus anything added on top of it.
      const gross = basic + hra + other + n(s.incentives) + n(s.bonus)
        + n(s.overtime_amount) + n(s.arrears);

      const pfEmployee = n(s.pf_employee);
      const esiEmployee = n(s.esi_employee);
      const pTax = n(s.pt_amount);
      // TDS has no column of its own yet; the sheet's was empty for all 209
      // rows, so it is reported as zero rather than silently folded elsewhere.
      const tds = 0;
      const advance = n(s.advances_adjusted) + n(s.loan_emi_total) + n(s.discipline_fine);
      const totalDeductions = pfEmployee + esiEmployee + pTax + tds + advance;

      const present = n(s.present_days) + n(s.half_days) * 0.5 + n(s.paid_leave_days);
      const pfEmployer = n(s.pf_employer);
      const esiEmployer = n(s.esi_employer);

      return {
        slNo: 0,
        name: st?.full_name ?? 'Unknown',
        outlet,
        designation: st?.designation ?? '',
        workingDays: days,
        present,
        absent: n(s.absent_days),
        remainingLeaves: null,
        actualSalary: n(s.base_salary),
        gross,
        basic,
        hra,
        otherAllowance: other,
        pfEmployee,
        esiEmployee,
        pTax,
        tds,
        advance,
        totalDeductions,
        net: n(s.net_salary),
        pfEmployer,
        esiEmployer,
        totalEmployerContribution: pfEmployer + esiEmployer,
      };
    })
    .sort((a, b) => a.outlet.localeCompare(b.outlet) || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, slNo: i + 1 }));

  const sum = (pick: (r: RegisterRow) => number) => rows.reduce((t, r) => t + pick(r), 0);

  return {
    month,
    rows,
    totals: {
      workingDays: 0,
      present: 0,
      absent: 0,
      remainingLeaves: null,
      actualSalary: sum((r) => r.actualSalary),
      gross: sum((r) => r.gross),
      basic: sum((r) => r.basic),
      hra: sum((r) => r.hra),
      otherAllowance: sum((r) => r.otherAllowance),
      pfEmployee: sum((r) => r.pfEmployee),
      esiEmployee: sum((r) => r.esiEmployee),
      pTax: sum((r) => r.pTax),
      tds: sum((r) => r.tds),
      advance: sum((r) => r.advance),
      totalDeductions: sum((r) => r.totalDeductions),
      net: sum((r) => r.net),
      pfEmployer: sum((r) => r.pfEmployer),
      esiEmployer: sum((r) => r.esiEmployer),
      totalEmployerContribution: sum((r) => r.totalEmployerContribution),
    },
  };
}

/** "2026-08" -> "AUGUST'26", the heading style the existing sheet uses. */
export function monthHeading(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const names = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
    'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return `${names[(m || 1) - 1]}'${String(y).slice(2)}`;
}
