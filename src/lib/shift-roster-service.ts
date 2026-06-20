// ============================================================================
// Shifts & Roster — DB service layer (IO over the new tables, via anyClient).
// All business rules live in the pure shift-roster.ts; this just persists.
// ============================================================================

import { supabase } from '@/integrations/supabase/anyClient';
import { parseISO, eachDayOfInterval, format } from 'date-fns';
import {
  inferShift, shouldAutoPromote, autoPromoteEntry, shouldReverseAutoEntry,
  projectTemplate, nextEffectiveFrom,
  type RosterEntry, type RosterStatus, type WeekOffState, type AttendanceMode,
} from './shift-roster';

const todayISO = () => format(new Date(), 'yyyy-MM-dd');

// ---- Shifts + per-weekday timings ------------------------------------------
export interface ShiftRow {
  id: string; name: string; alias: string | null; color: string | null; description: string | null;
  is_one_time_all_days: boolean; has_break: boolean; is_open: boolean; is_active: boolean;
  check_in_time: string | null; check_out_time: string | null; created_at: string;
}
export interface ShiftTiming { weekday: number; start_time: string | null; end_time: string | null; break_start: string | null; break_end: string | null }

export async function listShifts(): Promise<ShiftRow[]> {
  const { data, error } = await supabase.from('shifts').select('*').eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []) as ShiftRow[];
}

export async function getShiftTimings(shiftId: string): Promise<ShiftTiming[]> {
  const { data } = await supabase.from('shift_day_timing').select('weekday, start_time, end_time, break_start, break_end').eq('shift_id', shiftId).order('weekday');
  return (data ?? []) as ShiftTiming[];
}

export async function saveShift(input: {
  id?: string; name: string; alias?: string | null; color?: string | null; description?: string | null;
  is_one_time_all_days: boolean; has_break: boolean; is_open: boolean; timings: ShiftTiming[];
}): Promise<string> {
  // A representative single time keeps the legacy check_in/out columns populated
  // (the settlement engine + older screens still read them).
  const rep = input.timings[0];
  const row = {
    name: input.name, alias: input.alias ?? null, color: input.color ?? null, description: input.description ?? null,
    is_one_time_all_days: input.is_one_time_all_days, has_break: input.has_break, is_open: input.is_open,
    check_in_time: input.is_open ? null : rep?.start_time ?? null,
    check_out_time: input.is_open ? null : rep?.end_time ?? null,
  };
  let shiftId = input.id;
  if (shiftId) {
    const { error } = await supabase.from('shifts').update(row).eq('id', shiftId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('shifts').insert(row).select('id').single();
    if (error) throw error;
    shiftId = (data as { id: string }).id;
  }
  // Replace timings (skip for Open shifts — they have none).
  await supabase.from('shift_day_timing').delete().eq('shift_id', shiftId);
  if (!input.is_open && input.timings.length) {
    const rows = input.timings.map((t) => ({ shift_id: shiftId, ...t }));
    const { error } = await supabase.from('shift_day_timing').insert(rows);
    if (error) throw error;
  }
  return shiftId!;
}

export async function setShiftActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('shifts').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}

// ---- Working-hour config (§1.3) + history (next-day) ------------------------
export interface WorkingHourConfig {
  full_day_minutes: number; half_day_minutes: number;
  attendance_mode: AttendanceMode; is_shift_wise_work_hrs: boolean;
}

export async function getWorkingHourConfig(): Promise<WorkingHourConfig> {
  const { data } = await supabase.from('hr_pay_rules').select('full_day_minutes, half_day_minutes, attendance_mode, is_shift_wise_work_hrs').maybeSingle();
  const r = (data ?? {}) as Partial<WorkingHourConfig>;
  return {
    full_day_minutes: r.full_day_minutes ?? 480,
    half_day_minutes: r.half_day_minutes ?? 240,
    attendance_mode: (r.attendance_mode as AttendanceMode) ?? 'ALL_PUNCH',
    is_shift_wise_work_hrs: r.is_shift_wise_work_hrs ?? false,
  };
}

/** Records a history row effective from the NEXT day, and updates the live
 *  singleton the engine reads. (Full date-based scoring against history is the
 *  integration follow-up; see README.) */
export async function saveWorkingHourConfig(cfg: WorkingHourConfig, userId: string | null): Promise<void> {
  const { error: hErr } = await supabase.from('working_hour_config_history').insert({
    effective_from: nextEffectiveFrom(todayISO()),
    full_day_minutes: cfg.full_day_minutes, half_day_minutes: cfg.half_day_minutes,
    attendance_mode: cfg.attendance_mode, is_shift_wise_work_hrs: cfg.is_shift_wise_work_hrs,
    created_by: userId,
  });
  if (hErr) throw hErr;
  const { data: existing } = await supabase.from('hr_pay_rules').select('id').maybeSingle();
  if (existing) await supabase.from('hr_pay_rules').update(cfg).eq('id', (existing as { id: string }).id);
  else await supabase.from('hr_pay_rules').insert({ ...cfg, singleton: true });
}

// ---- Weekly template: shift assignment + week off --------------------------
export async function listShiftAssignments(): Promise<{ staff_id: string; weekday: number; shift_id: string | null }[]> {
  const { data } = await supabase.from('shift_assignment').select('staff_id, weekday, shift_id');
  return (data ?? []) as { staff_id: string; weekday: number; shift_id: string | null }[];
}
export async function saveShiftAssignments(rows: { staff_id: string; weekday: number; shift_id: string | null }[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from('shift_assignment').upsert(rows, { onConflict: 'staff_id,weekday' });
  if (error) throw error;
}

export async function listWeekOff(): Promise<{ staff_id: string; weekday: number; state: WeekOffState }[]> {
  const { data } = await supabase.from('week_off').select('staff_id, weekday, state');
  return (data ?? []) as { staff_id: string; weekday: number; state: WeekOffState }[];
}
export async function saveWeekOff(rows: { staff_id: string; weekday: number; state: WeekOffState }[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from('week_off').upsert(rows, { onConflict: 'staff_id,weekday' });
  if (error) throw error;
}

// ---- Roster grid (date range) ----------------------------------------------
export interface RosterCell { staff_id: string; date: string; shift_id: string | null; status: RosterStatus | null }

/** Build the date-range grid: existing roster rows overlaid on the projected
 *  weekly template (Assignment ⊕ Week Off). A null cell = sparse (off by default). */
export async function buildRosterGrid(staffIds: string[], fromISO: string, toISO: string): Promise<Map<string, RosterCell>> {
  const dates = eachDayOfInterval({ start: parseISO(fromISO), end: parseISO(toISO) }).map((d) => format(d, 'yyyy-MM-dd'));
  const [asn, wo, existing] = await Promise.all([listShiftAssignments(), listWeekOff(), (async () => {
    const { data } = await supabase.from('staff_roster').select('staff_id, roster_date, shift_id, status').gte('roster_date', fromISO).lte('roster_date', toISO);
    return (data ?? []) as { staff_id: string; roster_date: string; shift_id: string | null; status: RosterStatus }[];
  })()]);

  const asnBy = new Map<string, Map<number, string | null>>();
  for (const a of asn) { if (!asnBy.has(a.staff_id)) asnBy.set(a.staff_id, new Map()); asnBy.get(a.staff_id)!.set(a.weekday, a.shift_id); }
  const woBy = new Map<string, Map<number, WeekOffState>>();
  for (const w of wo) { if (!woBy.has(w.staff_id)) woBy.set(w.staff_id, new Map()); woBy.get(w.staff_id)!.set(w.weekday, w.state); }
  const existingBy = new Map<string, { shift_id: string | null; status: RosterStatus }>();
  for (const e of existing) existingBy.set(`${e.staff_id}:${e.roster_date}`, { shift_id: e.shift_id, status: e.status });

  const grid = new Map<string, RosterCell>();
  for (const sid of staffIds) {
    for (const date of dates) {
      const k = `${sid}:${date}`;
      const ex = existingBy.get(k);
      if (ex) { grid.set(k, { staff_id: sid, date, shift_id: ex.shift_id, status: ex.status }); continue; }
      const weekday = parseISO(date).getDay();
      const proj = projectTemplate(weekday, asnBy.get(sid) ?? new Map(), woBy.get(sid) ?? new Map());
      grid.set(k, { staff_id: sid, date, shift_id: proj?.shiftId ?? null, status: proj?.status ?? null });
    }
  }
  return grid;
}

/** Persist explicit roster overrides (admin edits). status null clears the cell. */
export async function saveRosterCells(cells: { staff_id: string; date: string; shift_id: string | null; status: RosterStatus | null }[]): Promise<void> {
  const toDelete = cells.filter((c) => c.status === null);
  const toUpsert = cells.filter((c) => c.status !== null).map((c) => ({
    staff_id: c.staff_id, roster_date: c.date, shift_id: c.shift_id,
    status: c.status, is_off: c.status === 'OFF', source: 'MANUAL',
  }));
  if (toUpsert.length) {
    const { error } = await supabase.from('staff_roster').upsert(toUpsert, { onConflict: 'staff_id,roster_date' });
    if (error) throw error;
  }
  for (const c of toDelete) await supabase.from('staff_roster').delete().eq('staff_id', c.staff_id).eq('roster_date', c.date);
}

// ---- §7 auto-promote / reversal --------------------------------------------

/** §7.3 — on check-in, auto-insert an AUTO_PRESENT roster row when the person is
 *  unrostered or OFF for the day. infer_shift = their weekday assignment → Open. */
export async function autoPromoteOnCheckIn(staffId: string, dateISO: string): Promise<void> {
  const { data: ex } = await supabase.from('staff_roster').select('shift_id, status, source').eq('staff_id', staffId).eq('roster_date', dateISO).maybeSingle();
  const entry: RosterEntry | null = ex ? { shift_id: ex.shift_id, status: ex.status, source: ex.source } : null;
  if (!shouldAutoPromote(entry)) return;

  const weekday = parseISO(dateISO).getDay();
  const { data: asn } = await supabase.from('shift_assignment').select('shift_id').eq('staff_id', staffId).eq('weekday', weekday).maybeSingle();
  const shiftId = inferShift(new Map([[weekday, (asn as { shift_id?: string | null } | null)?.shift_id ?? null]]), weekday);
  const promoted = autoPromoteEntry(shiftId);

  await supabase.from('staff_roster').upsert(
    { staff_id: staffId, roster_date: dateISO, shift_id: promoted.shift_id, status: promoted.status, source: promoted.source, is_off: false },
    { onConflict: 'staff_id,roster_date' },
  );
}

/** §7.4 — if a day's punches are gone, drop the roster row only when auto-added. */
export async function reverseAutoEntryIfNeeded(staffId: string, dateISO: string): Promise<void> {
  const { data: row } = await supabase.from('staff_roster').select('shift_id, status, source').eq('staff_id', staffId).eq('roster_date', dateISO).maybeSingle();
  if (!row) return;
  const { count } = await supabase.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('staff_id', staffId).eq('work_date', dateISO);
  const entry: RosterEntry = { shift_id: row.shift_id, status: row.status, source: row.source };
  if (shouldReverseAutoEntry(entry, (count ?? 0) > 0)) {
    await supabase.from('staff_roster').delete().eq('staff_id', staffId).eq('roster_date', dateISO);
  }
}
