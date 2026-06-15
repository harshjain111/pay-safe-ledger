import { supabase } from '@/integrations/supabase/client';

export type LeaveAccrual = 'annual' | 'monthly';

export interface LeaveSettings {
  annual_quota: number;
  accrual: LeaveAccrual;
}

export const DEFAULT_LEAVE_SETTINGS: LeaveSettings = { annual_quota: 12, accrual: 'annual' };

export async function fetchLeaveSettings(): Promise<LeaveSettings> {
  // Source the canonical paid-leave quota from the default leave TYPE (the
  // migrated single quota). Fall back to the legacy leave_settings table, then
  // to defaults — so existing balance cards keep working without changes.
  const { data: def } = await supabase
    .from('leave_types')
    .select('default_quota, accrual')
    .eq('is_default', true)
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle();
  if (def) {
    const d = def as { default_quota?: number; accrual?: string };
    return {
      annual_quota: Number(d.default_quota ?? 12),
      accrual: d.accrual === 'monthly' ? 'monthly' : 'annual',
    };
  }
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
    .eq('leave_type', 'paid')
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
  // Via a SECURITY DEFINER RPC so owner AND admin/accountant can read comp-off
  // totals without exposing the owner-only salary_settlements rows directly.
  const { data } = await supabase.rpc('get_comp_off_earned_by_staff', { _year: year });
  const map: Record<string, number> = {};
  ((data ?? []) as { staff_id: string; comp_off: number | null }[]).forEach((r) => {
    map[r.staff_id] = Number(r.comp_off ?? 0);
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
    .eq('leave_type', 'paid')
    .gte('leave_date', `${year}-01-01`)
    .lte('leave_date', `${year}-12-31`);
  return count ?? 0;
}

// ===========================================================================
// Multiple leave types
// ===========================================================================

export type LeaveAccrualMode = 'annual' | 'monthly' | 'none';

export interface LeaveTypeRow {
  id: string;
  name: string;
  code: string;
  is_paid: boolean;
  accrual: LeaveAccrualMode;
  default_quota: number;
  default_deduction: number;
  carry_forward: boolean;
  max_balance: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export async function fetchLeaveTypes(activeOnly = false): Promise<LeaveTypeRow[]> {
  let q = supabase
    .from('leave_types')
    .select('id, name, code, is_paid, accrual, default_quota, default_deduction, carry_forward, max_balance, is_default, is_active, sort_order')
    .order('sort_order');
  if (activeOnly) q = q.eq('is_active', true);
  const { data } = await q;
  return (data ?? []) as unknown as LeaveTypeRow[];
}

/** Days accrued for a type by `now` (annual = full quota; monthly prorates;
 *  none = 0). */
export function accruedForType(
  type: Pick<LeaveTypeRow, 'accrual' | 'default_quota'>,
  year: number,
  now: Date,
): number {
  if (type.accrual === 'none') return 0;
  if (type.accrual === 'monthly') {
    const monthsElapsed = now.getFullYear() > year ? 12 : now.getFullYear() < year ? 0 : now.getMonth() + 1;
    return Math.round((type.default_quota / 12) * monthsElapsed * 100) / 100;
  }
  return type.default_quota; // annual
}

export interface LeaveTypeBalance {
  type: LeaveTypeRow;
  opening: number;
  accrued: number;
  used: number;
  balance: number;
}

/** Per-type leave balance for a staff member in a calendar year:
 *  balance = opening (carry-forward) + accrued − used. */
export async function computeLeaveBalancesForStaff(
  staffId: string,
  year: number,
  now: Date = new Date(),
): Promise<LeaveTypeBalance[]> {
  const [types, recordsRes, openingRes] = await Promise.all([
    fetchLeaveTypes(true),
    supabase
      .from('leave_records')
      .select('leave_type_id')
      .eq('staff_id', staffId)
      .eq('status', 'approved')
      .gte('leave_date', `${year}-01-01`)
      .lte('leave_date', `${year}-12-31`),
    supabase.from('leave_balances').select('leave_type_id, opening').eq('staff_id', staffId).eq('year', year),
  ]);

  const usedByType = new Map<string, number>();
  for (const r of (recordsRes.data ?? []) as { leave_type_id: string | null }[]) {
    if (!r.leave_type_id) continue;
    usedByType.set(r.leave_type_id, (usedByType.get(r.leave_type_id) ?? 0) + 1);
  }
  const openingByType = new Map<string, number>();
  for (const b of (openingRes.data ?? []) as { leave_type_id: string; opening: number | null }[]) {
    openingByType.set(b.leave_type_id, Number(b.opening ?? 0));
  }

  return types.map((t) => {
    const opening = openingByType.get(t.id) ?? 0;
    const accrued = accruedForType(t, year, now);
    const used = usedByType.get(t.id) ?? 0;
    return { type: t, opening, accrued, used, balance: Math.round((opening + accrued - used) * 100) / 100 };
  });
}
