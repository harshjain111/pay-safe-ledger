import { supabase } from '@/integrations/supabase/client';

export type LeaveAccrual = 'annual' | 'monthly';

export interface LeaveSettings {
  annual_quota: number;
  accrual: LeaveAccrual;
}

export const DEFAULT_LEAVE_SETTINGS: LeaveSettings = { annual_quota: 12, accrual: 'annual' };

export async function fetchLeaveSettings(): Promise<LeaveSettings> {
  const { data } = await supabase
    .from('leave_settings' as never)
    .select('annual_quota, accrual')
    .maybeSingle();
  if (!data) return DEFAULT_LEAVE_SETTINGS;
  const d = data as { annual_quota?: number; accrual?: string };
  return {
    annual_quota: Number(d.annual_quota ?? 12),
    accrual: d.accrual === 'monthly' ? 'monthly' : 'annual',
  };
}

/** Entitled paid-leave days for `year`, as of `now` (monthly accrual prorates). */
export function entitledForYear(settings: LeaveSettings, year: number, now: Date): number {
  if (settings.accrual === 'monthly') {
    const monthsElapsed =
      now.getFullYear() > year ? 12 : now.getFullYear() < year ? 0 : now.getMonth() + 1;
    return Math.round((settings.annual_quota / 12) * monthsElapsed * 100) / 100;
  }
  return settings.annual_quota;
}

export interface LeaveBalance {
  entitled: number;
  taken: number;
  compOff: number;
  remaining: number;
}

export function computeBalance(entitled: number, taken: number, compOff = 0): LeaveBalance {
  const remaining = Math.round((entitled + compOff - taken) * 100) / 100;
  return { entitled, taken, compOff, remaining };
}

/** Approved leave-day count per staff for the given calendar year. */
export async function fetchTakenLeaveByStaff(year: number): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('leave_records')
    .select('staff_id')
    .eq('status', 'approved')
    .gte('leave_date', `${year}-01-01`)
    .lte('leave_date', `${year}-12-31`);
  const taken: Record<string, number> = {};
  ((data ?? []) as { staff_id: string }[]).forEach((r) => {
    taken[r.staff_id] = (taken[r.staff_id] ?? 0) + 1;
  });
  return taken;
}

/** Comp-off days earned (off-days worked) per staff from settled months this year. */
export async function fetchCompOffByStaff(year: number): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('salary_settlements' as never)
    .select('staff_id, comp_off_earned')
    .like('settlement_month', `${year}-%`);
  const map: Record<string, number> = {};
  ((data ?? []) as { staff_id: string; comp_off_earned: number | null }[]).forEach((r) => {
    map[r.staff_id] = (map[r.staff_id] ?? 0) + Number(r.comp_off_earned ?? 0);
  });
  return map;
}

/** Comp-off days earned for one staff member from settled months this year. */
export async function fetchCompOffForStaff(staffId: string, year: number): Promise<number> {
  const { data } = await supabase
    .from('salary_settlements' as never)
    .select('comp_off_earned')
    .eq('staff_id', staffId)
    .like('settlement_month', `${year}-%`);
  return ((data ?? []) as { comp_off_earned: number | null }[]).reduce(
    (s, r) => s + Number(r.comp_off_earned ?? 0),
    0,
  );
}

/** Approved leave-day count for one staff member in the given year. */
export async function fetchTakenLeaveForStaff(staffId: string, year: number): Promise<number> {
  const { count } = await supabase
    .from('leave_records')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', staffId)
    .eq('status', 'approved')
    .gte('leave_date', `${year}-01-01`)
    .lte('leave_date', `${year}-12-31`);
  return count ?? 0;
}
