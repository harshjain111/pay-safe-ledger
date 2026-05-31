import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fetchDisciplineRules, fetchStaffAssignment, type Slab as RuleSlab } from '@/lib/discipline';

export type WaSlab = 'on_time' | 'level_1' | 'level_2' | 'half_day' | 'full_day';

interface StaffRow {
  id: string;
  full_name: string;
  phone: string | null;
  monthly_salary: number;
  attendance_tracked: boolean | null;
}

function resolveSlab(
  minutesOver: number,
  slabs: RuleSlab[],
  halfDayAfter: number,
  fullDayAfter: number,
  dailySalary: number,
): { slab: WaSlab; amount: number } {
  if (minutesOver <= 0) return { slab: 'on_time', amount: 0 };
  if (fullDayAfter > 0 && minutesOver >= fullDayAfter) {
    return { slab: 'full_day', amount: Math.round(dailySalary) };
  }
  if (halfDayAfter > 0 && minutesOver >= halfDayAfter) {
    return { slab: 'half_day', amount: Math.round(dailySalary / 2) };
  }
  const sorted = [...slabs].sort((a, b) => a.from_min - b.from_min);
  // Use first slab as level_1, anything beyond first as level_2
  if (sorted.length === 0) return { slab: 'on_time', amount: 0 };
  const first = sorted[0];
  if (minutesOver < first.from_min) return { slab: 'on_time', amount: 0 };
  if (sorted.length === 1 || minutesOver < (sorted[1]?.from_min ?? Infinity)) {
    return { slab: 'level_1', amount: Number(first.amount) || 0 };
  }
  // level_2: pick the highest slab whose from_min has been crossed
  let chosen = sorted[1];
  for (const s of sorted.slice(1)) {
    if (minutesOver >= s.from_min) chosen = s;
  }
  return { slab: 'level_2', amount: Number(chosen.amount) || 0 };
}

async function getScheduledTimes(staffId: string): Promise<{
  scheduledIn: string | null;
  scheduledOut: string | null;
}> {
  const assignment = await fetchStaffAssignment(staffId);
  if (!assignment) return { scheduledIn: null, scheduledOut: null };
  let scheduledIn = assignment.override_check_in;
  let scheduledOut = assignment.override_check_out;
  if ((!scheduledIn || !scheduledOut) && assignment.shift_id) {
    const { data: shift } = await supabase
      .from('shifts' as never)
      .select('*')
      .eq('id', assignment.shift_id)
      .maybeSingle();
    if (shift) {
      const s = shift as { check_in_time: string; check_out_time: string };
      scheduledIn = scheduledIn ?? s.check_in_time;
      scheduledOut = scheduledOut ?? s.check_out_time;
    }
  }
  return { scheduledIn, scheduledOut };
}

function scheduledIsoFromTime(workDate: string, time: string, nextDay = false): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(workDate + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  if (nextDay) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

async function dispatch(
  staff: StaffRow,
  eventType: 'checkin' | 'checkout',
  actualIso: string,
  scheduledIso: string,
  slab: WaSlab,
  deductionAmount: number,
) {
  if (!staff.phone) return;
  try {
    const { data, error } = await supabase.functions.invoke('send-attendance-whatsapp', {
      body: {
        staff_name: staff.full_name,
        staff_phone: staff.phone,
        staff_id: staff.id,
        event_type: eventType,
        actual_time: actualIso,
        scheduled_time: scheduledIso,
        slab,
        deduction_amount: deductionAmount,
      },
    });
    if (error || (data && data.success === false)) {
      console.error('WhatsApp send failed', error || data);
      toast.error(`WhatsApp notification failed for ${staff.full_name}`);
      return;
    }
    toast.success(`WhatsApp notification sent to ${staff.full_name}`);
  } catch (e) {
    console.error('WhatsApp dispatch error', e);
    toast.error(`WhatsApp notification failed for ${staff.full_name}`);
  }
}

async function loadStaff(staffId: string): Promise<StaffRow | null> {
  const { data } = await supabase
    .from('staff')
    .select('id, full_name, phone, monthly_salary, attendance_tracked')
    .eq('id', staffId)
    .maybeSingle();
  return (data as StaffRow | null) ?? null;
}

export async function notifyCheckinWhatsapp(
  staffId: string,
  checkInIso: string,
  workDate: string,
): Promise<void> {
  try {
    const staff = await loadStaff(staffId);
    if (!staff || staff.attendance_tracked === false) return;
    const rules = await fetchDisciplineRules();
    if (!rules) return;
    const { scheduledIn } = await getScheduledTimes(staffId);
    if (!scheduledIn) return;

    const scheduledIso = scheduledIsoFromTime(workDate, scheduledIn);

    // Master switch off: send on-time greeting only, never a fine message
    if (rules.penalties_enabled === false) {
      await dispatch(staff, 'checkin', checkInIso, scheduledIso, 'on_time', 0);
      return;
    }

    const lateMin = Math.round(
      (new Date(checkInIso).getTime() - new Date(scheduledIso).getTime()) / 60000,
    );
    const lateAfterGrace = Math.max(0, lateMin - rules.grace_minutes_in);

    const daysInMonth = new Date(
      new Date(workDate).getFullYear(),
      new Date(workDate).getMonth() + 1,
      0,
    ).getDate();
    const dailySalary =
      daysInMonth > 0 && staff.monthly_salary > 0 ? staff.monthly_salary / daysInMonth : 0;

    const { slab, amount } = resolveSlab(
      lateAfterGrace,
      rules.late_in_slabs,
      rules.late_in_half_day_after_min,
      rules.late_in_full_day_after_min,
      dailySalary,
    );

    await dispatch(staff, 'checkin', checkInIso, scheduledIso, slab, amount);
  } catch (e) {
    console.error('notifyCheckinWhatsapp failed', e);
  }
}

export async function notifyCheckoutWhatsapp(
  staffId: string,
  checkOutIso: string,
  workDate: string,
): Promise<void> {
  try {
    const staff = await loadStaff(staffId);
    if (!staff || staff.attendance_tracked === false) return;
    const rules = await fetchDisciplineRules();
    if (!rules) return;

    // Master switch off: never send any check-out fine message
    if (rules.penalties_enabled === false) return;

    const { scheduledIn, scheduledOut } = await getScheduledTimes(staffId);
    if (!scheduledOut) return;

    // Handle night shifts: scheduled_out next-day when out <= in
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const nextDay = scheduledIn ? toMin(scheduledOut) <= toMin(scheduledIn) : false;
    const scheduledIso = scheduledIsoFromTime(workDate, scheduledOut, nextDay);

    const earlyMin = Math.round(
      (new Date(scheduledIso).getTime() - new Date(checkOutIso).getTime()) / 60000,
    );
    const earlyAfterGrace = Math.max(0, earlyMin - rules.grace_minutes_out);

    const daysInMonth = new Date(
      new Date(workDate).getFullYear(),
      new Date(workDate).getMonth() + 1,
      0,
    ).getDate();
    const dailySalary =
      daysInMonth > 0 && staff.monthly_salary > 0 ? staff.monthly_salary / daysInMonth : 0;

    const { slab, amount } = resolveSlab(
      earlyAfterGrace,
      rules.early_out_slabs,
      rules.early_out_half_day_after_min,
      rules.early_out_full_day_after_min,
      dailySalary,
    );

    await dispatch(staff, 'checkout', checkOutIso, scheduledIso, slab, amount);
  } catch (e) {
    console.error('notifyCheckoutWhatsapp failed', e);
  }
}
