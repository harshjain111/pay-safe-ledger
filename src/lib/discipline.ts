import { supabase } from '@/integrations/supabase/client';

export interface Slab {
  from_min: number;
  to_min: number;
  amount: number;
}

export interface DisciplineRules {
  id: string;
  grace_minutes_in: number;
  late_in_slabs: Slab[];
  late_in_half_day_after_min: number;
  late_in_full_day_after_min: number;
  grace_minutes_out: number;
  early_out_slabs: Slab[];
  early_out_half_day_after_min: number;
  early_out_full_day_after_min: number;
  absent_no_checkin_deduction: string; // 'full_day' | 'half_day' | numeric string
  absent_no_checkout_deduction: string;
  penalties_enabled: boolean;
}

export interface DisciplineLogRow {
  id: string;
  session_id: string | null;
  staff_id: string;
  work_date: string;
  scheduled_check_in: string | null;
  scheduled_check_out: string | null;
  late_in_minutes: number;
  early_out_minutes: number;
  fine_amount: number;
  fine_reason: string | null;
  is_absent: boolean;
  absent_reason: string | null;
  computed_at: string;
  is_cancelled?: boolean;
  cancelled_by?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

export interface Shift {
  id: string;
  name: string;
  check_in_time: string; // HH:MM:SS
  check_out_time: string;
  is_active: boolean;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  staff_id: string;
  shift_id: string | null;
  override_check_in: string | null;
  override_check_out: string | null;
  effective_from: string;
}

// -------- Fetchers --------

export async function fetchDisciplineRules(): Promise<DisciplineRules | null> {
  const { data, error } = await supabase
    .from('discipline_rules' as never)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('fetchDisciplineRules', error);
    return null;
  }
  return (data as DisciplineRules | null) ?? null;
}

export async function fetchShifts(): Promise<Shift[]> {
  const { data, error } = await supabase
    .from('shifts' as never)
    .select('*')
    .order('name');
  if (error) throw error;
  return (data as Shift[]) ?? [];
}

export async function fetchAssignments(): Promise<ShiftAssignment[]> {
  const { data, error } = await supabase
    .from('staff_shift_assignments' as never)
    .select('*');
  if (error) throw error;
  return (data as ShiftAssignment[]) ?? [];
}

export async function fetchStaffAssignment(
  staffId: string,
): Promise<ShiftAssignment | null> {
  const { data, error } = await supabase
    .from('staff_shift_assignments' as never)
    .select('*')
    .eq('staff_id', staffId)
    .maybeSingle();
  if (error) {
    console.error('fetchStaffAssignment', error);
    return null;
  }
  return (data as ShiftAssignment | null) ?? null;
}

// -------- Core compute --------

/** Parses HH:MM(:SS) into total minutes from midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function diffMinutesActualVsScheduled(
  actualIso: string,
  scheduledTime: string,
  workDate: string,
): number {
  // Build a Date for "scheduled" on the workDate (local).
  const [h, m] = scheduledTime.split(':').map(Number);
  const scheduled = new Date(workDate + 'T00:00:00');
  scheduled.setHours(h, m, 0, 0);
  const actual = new Date(actualIso);
  return Math.round((actual.getTime() - scheduled.getTime()) / 60000);
}

function applyLadder(
  minutesOver: number,
  slabs: Slab[],
  halfDayAfter: number,
  fullDayAfter: number,
  dailySalary: number,
): { amount: number; tier: string } {
  if (minutesOver <= 0) return { amount: 0, tier: 'on_time' };
  if (fullDayAfter > 0 && minutesOver >= fullDayAfter) {
    return { amount: dailySalary, tier: 'full_day' };
  }
  if (halfDayAfter > 0 && minutesOver >= halfDayAfter) {
    return { amount: dailySalary / 2, tier: 'half_day' };
  }
  const sorted = [...slabs].sort((a, b) => a.from_min - b.from_min);
  for (const s of sorted) {
    if (minutesOver >= s.from_min && minutesOver < s.to_min) {
      return { amount: Number(s.amount) || 0, tier: `slab_${s.from_min}_${s.to_min}` };
    }
  }
  // beyond last slab but below half-day threshold
  const last = sorted[sorted.length - 1];
  if (last && minutesOver >= last.to_min) {
    return { amount: Number(last.amount) || 0, tier: `slab_${last.from_min}_${last.to_min}` };
  }
  return { amount: 0, tier: 'within_grace' };
}

export interface ComputeInput {
  staffId: string;
  userId: string;
  sessionId: string;
  workDate: string;
  checkInIso: string;
  checkOutIso: string;
  monthlySalary: number;
  daysInMonth: number;
}

export interface ComputeResult {
  late_in_minutes: number;
  early_out_minutes: number;
  fine_amount: number;
  fine_reason: string;
  scheduled_check_in: string | null;
  scheduled_check_out: string | null;
  is_absent: boolean;
  absent_reason: string | null;
}

/**
 * Computes discipline for a session and upserts to attendance_discipline_log.
 * Returns null when staff has no shift assignment (no scheduled time → no fine).
 */
export async function computeAndLogDiscipline(
  input: ComputeInput,
): Promise<ComputeResult | null> {
  const rules = await fetchDisciplineRules();
  if (!rules) return null;

  // Master penalty switch: if disabled, do not compute any fines
  if (rules.penalties_enabled === false) {
    return null;
  }

  const assignment = await fetchStaffAssignment(input.staffId);
  if (!assignment) return null;

  let scheduledIn: string | null = assignment.override_check_in;
  let scheduledOut: string | null = assignment.override_check_out;
  if ((!scheduledIn || !scheduledOut) && assignment.shift_id) {
    const { data: shift } = await supabase
      .from('shifts' as never)
      .select('*')
      .eq('id', assignment.shift_id)
      .maybeSingle();
    if (shift) {
      const s = shift as Shift;
      scheduledIn = scheduledIn ?? s.check_in_time;
      scheduledOut = scheduledOut ?? s.check_out_time;
    }
  }
  if (!scheduledIn || !scheduledOut) return null;

  // Skip fine if approved leave exists for this date
  const { data: leave } = await supabase
    .from('leave_records' as never)
    .select('id')
    .eq('staff_id', input.staffId)
    .eq('leave_date', input.workDate)
    .eq('status', 'approved')
    .maybeSingle();
  if (leave) return null;

  const dailySalary =
    input.daysInMonth > 0 && input.monthlySalary > 0
      ? input.monthlySalary / input.daysInMonth
      : 0;

  const lateMinRaw = diffMinutesActualVsScheduled(
    input.checkInIso,
    scheduledIn,
    input.workDate,
  );
  const lateMinAfterGrace = Math.max(0, lateMinRaw - rules.grace_minutes_in);

  // Early-out is in *minutes early* — actual is before scheduled_out
  // scheduled_out can be same day OR next day (e.g. 02:00 for night shifts).
  // Heuristic: if scheduled_out time (in minutes from midnight) is less than scheduled_in,
  // treat scheduled_out as next-day.
  const inMin = timeToMinutes(scheduledIn);
  const outMin = timeToMinutes(scheduledOut);
  const scheduledOutDate = new Date(input.workDate + 'T00:00:00');
  const [oh, om] = scheduledOut.split(':').map(Number);
  scheduledOutDate.setHours(oh, om, 0, 0);
  if (outMin <= inMin) {
    scheduledOutDate.setDate(scheduledOutDate.getDate() + 1);
  }
  const actualOut = new Date(input.checkOutIso);
  const earlyMinRaw = Math.round(
    (scheduledOutDate.getTime() - actualOut.getTime()) / 60000,
  );
  const earlyMinAfterGrace = Math.max(0, earlyMinRaw - rules.grace_minutes_out);

  const late = applyLadder(
    lateMinAfterGrace,
    rules.late_in_slabs,
    rules.late_in_half_day_after_min,
    rules.late_in_full_day_after_min,
    dailySalary,
  );
  const early = applyLadder(
    earlyMinAfterGrace,
    rules.early_out_slabs,
    rules.early_out_half_day_after_min,
    rules.early_out_full_day_after_min,
    dailySalary,
  );

  let total = late.amount + early.amount;
  // Cap at one full day's salary
  if (dailySalary > 0) total = Math.min(total, dailySalary);

  const reasonParts: string[] = [];
  if (late.amount > 0)
    reasonParts.push(`Late by ${lateMinAfterGrace}m → ${late.tier} (₹${late.amount.toFixed(0)})`);
  if (early.amount > 0)
    reasonParts.push(
      `Early out by ${earlyMinAfterGrace}m → ${early.tier} (₹${early.amount.toFixed(0)})`,
    );
  const reason = reasonParts.join('; ') || 'On time';

  const result: ComputeResult = {
    late_in_minutes: lateMinAfterGrace,
    early_out_minutes: earlyMinAfterGrace,
    fine_amount: Math.round(total * 100) / 100,
    fine_reason: reason,
    scheduled_check_in: scheduledIn,
    scheduled_check_out: scheduledOut,
    is_absent: false,
    absent_reason: null,
  };

  // Upsert (one row per staff/work_date)
  const { data: existing } = await supabase
    .from('attendance_discipline_log' as never)
    .select('id')
    .eq('staff_id', input.staffId)
    .eq('work_date', input.workDate)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('attendance_discipline_log' as never)
      .update({
        session_id: input.sessionId,
        scheduled_check_in: scheduledIn,
        scheduled_check_out: scheduledOut,
        late_in_minutes: result.late_in_minutes,
        early_out_minutes: result.early_out_minutes,
        fine_amount: result.fine_amount,
        fine_reason: result.fine_reason,
        is_absent: false,
        absent_reason: null,
        computed_at: new Date().toISOString(),
      } as never)
      .eq('id', (existing as { id: string }).id);
  } else {
    await supabase.from('attendance_discipline_log' as never).insert({
      session_id: input.sessionId,
      staff_id: input.staffId,
      work_date: input.workDate,
      scheduled_check_in: scheduledIn,
      scheduled_check_out: scheduledOut,
      late_in_minutes: result.late_in_minutes,
      early_out_minutes: result.early_out_minutes,
      fine_amount: result.fine_amount,
      fine_reason: result.fine_reason,
      is_absent: false,
      absent_reason: null,
    } as never);
  }

  return result;
}

/** Sums fine_amount + absent deduction estimate for a staff/month. */
export async function getMonthlyDisciplineFine(
  staffId: string,
  month: string, // YYYY-MM
  monthlySalary: number,
): Promise<{ totalFine: number; logs: DisciplineLogRow[] }> {
  const monthStart = month + '-01';
  const start = new Date(monthStart);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  const endStr = end.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('attendance_discipline_log' as never)
    .select('*')
    .eq('staff_id', staffId)
    .gte('work_date', monthStart)
    .lt('work_date', endStr)
    .order('work_date');
  if (error) {
    console.error('getMonthlyDisciplineFine', error);
    return { totalFine: 0, logs: [] };
  }
  const logs = (data as DisciplineLogRow[]) ?? [];
  // Cancelled rows contribute 0 to the total
  const total = logs.reduce(
    (s, r) => s + (r.is_cancelled ? 0 : Number(r.fine_amount || 0)),
    0,
  );
  return { totalFine: Math.round(total * 100) / 100, logs };
}

/** Returns a human-friendly schedule string for display. */
export function formatScheduleRange(inT: string | null, outT: string | null): string {
  if (!inT || !outT) return '—';
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
  };
  return `${fmt(inT)} → ${fmt(outT)}`;
}
