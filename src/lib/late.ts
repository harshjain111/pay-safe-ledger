import { supabase } from '@/integrations/supabase/client';

// Real-time "late" for a date, mirroring the discipline engine
// (check-absent-staff): late = earliest check-in later than the scheduled shift
// start (legacy staff_shift_assignments → shifts.check_in_time) by more than the
// grace window (discipline_rules.grace_minutes_in). The nightly discipline sweep
// only writes attendance_discipline_log after the fact, so the dashboard computes
// this live instead.

export interface LateRow {
  staff_id: string;
  employee_id: string;
  full_name: string;
  scheduledISO: string;
  checkInISO: string;
  lateMinutes: number; // minutes late AFTER the grace window
}

/** IST wall-clock `time` (HH:MM[:SS]) on `workDate` (yyyy-MM-dd) → UTC ISO. */
function scheduledIso(workDate: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const utcMin = h * 60 + (m || 0) - (5 * 60 + 30); // IST = UTC+5:30
  const d = new Date(workDate + 'T00:00:00Z');
  d.setUTCMinutes(d.getUTCMinutes() + utcMin);
  return d.toISOString();
}

export async function fetchLateForDate(dateStr: string, outletId?: string): Promise<LateRow[]> {
  let staffQuery = supabase.from('staff').select('id, employee_id, full_name').eq('is_active', true).eq('attendance_tracked', true);
  if (outletId) staffQuery = staffQuery.eq('outlet_id', outletId);
  const [staffRes, rulesRes, sessRes] = await Promise.all([
    staffQuery,
    supabase.from('discipline_rules' as never).select('grace_minutes_in').order('updated_at', { ascending: false }).limit(1),
    supabase.from('attendance_sessions' as never).select('staff_id, check_in_at').eq('work_date', dateStr),
  ]);

  const staffList = (staffRes.data ?? []) as { id: string; employee_id: string; full_name: string }[];
  if (!staffList.length) return [];
  const grace = Number(((rulesRes.data ?? [])[0] as { grace_minutes_in?: number } | undefined)?.grace_minutes_in ?? 10);
  const ids = staffList.map((s) => s.id);

  const { data: assigns } = await supabase
    .from('staff_shift_assignments' as never)
    .select('staff_id, shift_id')
    .in('staff_id', ids);
  const shiftByStaff = new Map<string, string>();
  for (const a of (assigns ?? []) as { staff_id: string; shift_id: string | null }[]) {
    if (a.shift_id) shiftByStaff.set(a.staff_id, a.shift_id);
  }
  const shiftIds = Array.from(new Set([...shiftByStaff.values()]));
  const startByShift = new Map<string, string>();
  if (shiftIds.length) {
    const { data: shifts } = await supabase.from('shifts').select('id, check_in_time').in('id', shiftIds);
    for (const s of (shifts ?? []) as { id: string; check_in_time: string }[]) startByShift.set(s.id, s.check_in_time);
  }

  // Earliest check-in per staff for the date.
  const checkInByStaff = new Map<string, string>();
  for (const s of (sessRes.data ?? []) as { staff_id: string; check_in_at: string | null }[]) {
    if (!s.check_in_at) continue;
    const cur = checkInByStaff.get(s.staff_id);
    if (!cur || s.check_in_at < cur) checkInByStaff.set(s.staff_id, s.check_in_at);
  }

  const infoById = new Map(staffList.map((s) => [s.id, s]));
  const rows: LateRow[] = [];
  for (const [sid, checkInISO] of checkInByStaff) {
    const shiftId = shiftByStaff.get(sid);
    if (!shiftId) continue; // no schedule → can't judge lateness
    const startTime = startByShift.get(shiftId);
    if (!startTime) continue;
    const scheduledISO = scheduledIso(dateStr, startTime);
    const lateMin = Math.round((new Date(checkInISO).getTime() - new Date(scheduledISO).getTime()) / 60000) - grace;
    if (lateMin > 0) {
      const info = infoById.get(sid)!;
      rows.push({ staff_id: sid, employee_id: info.employee_id, full_name: info.full_name, scheduledISO, checkInISO, lateMinutes: lateMin });
    }
  }
  return rows.sort((a, b) => b.lateMinutes - a.lateMinutes);
}
