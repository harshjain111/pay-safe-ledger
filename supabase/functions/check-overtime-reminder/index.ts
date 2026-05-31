// Two responsibilities, run every 30 minutes by pg_cron:
//   1) Send a WhatsApp checkout reminder for any OPEN attendance_session that
//      has been open >= 10 hours and hasn't already received a reminder.
//   2) Auto-close any OPEN attendance_session that has been open >= 16 hours
//      by setting check_out_at = check_in_at + scheduled shift duration
//      (fallback 10h), worked_minutes, status='completed', auto_closed=true.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const SIXTEEN_HOURS_MS = 16 * 60 * 60 * 1000;
const FALLBACK_SHIFT_MINUTES = 10 * 60;

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (!isFinite(h) || !isFinite(m)) return null;
  return h * 60 + m;
}

function shiftDurationMinutes(
  inTime: string | null | undefined,
  outTime: string | null | undefined,
): number | null {
  const a = timeToMinutes(inTime);
  const b = timeToMinutes(outTime);
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff <= 0) diff += 24 * 60; // cross-midnight
  return diff;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = Date.now();
  const tenAgoIso = new Date(now - TEN_HOURS_MS).toISOString();
  const sixteenAgoIso = new Date(now - SIXTEEN_HOURS_MS).toISOString();

  const reminders_sent = 0;
  const reminder_failures = 0;
  let auto_closed = 0;

  try {
    // ---------- 1) 10-hour reminders ----------
    const { data: needReminder } = await supabase
      .from('attendance_sessions')
      .select('id, staff_id, check_in_at')
      .in('status', ['active', 'on_break'])
      .is('check_out_at', null)
      .eq('overtime_reminder_sent', false)
      .lte('check_in_at', tenAgoIso);

    if (needReminder && needReminder.length > 0) {
      const ids = needReminder.map((r: { staff_id: string | null }) => r.staff_id).filter(Boolean) as string[];
      const { data: staffRows } = await supabase
        .from('staff')
        .select('id, full_name, phone, attendance_tracked')
        .in('id', ids);
      const staffMap = new Map<string, { full_name: string; phone: string | null; attendance_tracked: boolean | null }>();
      (staffRows ?? []).forEach((s: { id: string; full_name: string; phone: string | null; attendance_tracked: boolean | null }) =>
        staffMap.set(s.id, { full_name: s.full_name, phone: s.phone, attendance_tracked: s.attendance_tracked }),
      );

      for (const row of needReminder as Array<{ id: string; staff_id: string | null; check_in_at: string }>) {
        if (!row.staff_id) continue;
        const staff = staffMap.get(row.staff_id);
        if (!staff || staff.attendance_tracked === false) continue;
        // Mark sent regardless (WhatsApp reminders disabled)
        await supabase
          .from('attendance_sessions')
          .update({ overtime_reminder_sent: true })
          .eq('id', row.id);
      }
    }


    // ---------- 2) 16-hour auto-close ----------
    const { data: stale } = await supabase
      .from('attendance_sessions')
      .select('id, staff_id, check_in_at, total_break_minutes')
      .in('status', ['active', 'on_break'])
      .is('check_out_at', null)
      .lte('check_in_at', sixteenAgoIso);

    if (stale && stale.length > 0) {
      const ids = stale.map((r: { staff_id: string | null }) => r.staff_id).filter(Boolean) as string[];
      const [{ data: assigns }, { data: shifts }] = await Promise.all([
        supabase
          .from('staff_shift_assignments')
          .select('staff_id, shift_id, override_check_in, override_check_out')
          .in('staff_id', ids),
        supabase.from('shifts').select('id, check_in_time, check_out_time'),
      ]);
      const shiftMap = new Map<string, { check_in_time: string; check_out_time: string }>(
        (shifts ?? []).map((s: { id: string; check_in_time: string; check_out_time: string }) => [s.id, s]),
      );
      const assignMap = new Map<string, { shift_id: string | null; override_check_in: string | null; override_check_out: string | null }>();
      (assigns ?? []).forEach((a: { staff_id: string; shift_id: string | null; override_check_in: string | null; override_check_out: string | null }) =>
        assignMap.set(a.staff_id, a),
      );

      for (const row of stale as Array<{
        id: string;
        staff_id: string | null;
        check_in_at: string;
        total_break_minutes: number | null;
      }>) {
        let durationMin: number | null = null;
        if (row.staff_id) {
          const a = assignMap.get(row.staff_id);
          if (a) {
            const sh = a.shift_id ? shiftMap.get(a.shift_id) : null;
            const inT = a.override_check_in || sh?.check_in_time || null;
            const outT = a.override_check_out || sh?.check_out_time || null;
            durationMin = shiftDurationMinutes(inT, outT);
          }
        }
        if (!durationMin || durationMin <= 0) durationMin = FALLBACK_SHIFT_MINUTES;

        const checkInMs = new Date(row.check_in_at).getTime();
        const checkOutIso = new Date(checkInMs + durationMin * 60 * 1000).toISOString();
        const workedMin = Math.max(0, durationMin - (row.total_break_minutes ?? 0));

        const { error: updErr } = await supabase
          .from('attendance_sessions')
          .update({
            status: 'completed',
            check_out_at: checkOutIso,
            worked_minutes: workedMin,
            auto_closed: true,
          })
          .eq('id', row.id);
        if (updErr) {
          console.error('auto-close failed', row.id, updErr);
        } else {
          auto_closed++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, reminders_sent, reminder_failures, auto_closed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('check-overtime-reminder error', e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        reminders_sent,
        reminder_failures,
        auto_closed,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
