// Mark staff absent for TODAY and send WhatsApp absent notifications.
// Triggered by a daily cron at 23:59 IST (18:29 UTC) and on-demand from the admin UI.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Today in IST as YYYY-MM-DD
function istToday(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function resolveDeduction(rule: string, dailySalary: number): number {
  if (rule === 'full_day') return dailySalary;
  if (rule === 'half_day') return dailySalary / 2;
  const n = Number(rule);
  return isFinite(n) ? n : 0;
}

function scheduledIso(workDate: string, time: string): string {
  // Build IST timestamp for the scheduled start, return as ISO UTC
  // IST = UTC+5:30
  const [h, m] = time.split(':').map(Number);
  const utcMin = h * 60 + (m || 0) - (5 * 60 + 30);
  const d = new Date(workDate + 'T00:00:00Z');
  d.setUTCMinutes(d.getUTCMinutes() + utcMin);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const workDate = istToday();
  let total_absent = 0;
  let notifications_sent = 0;
  let failures = 0;

  try {
    const { data: rules } = await supabase
      .from('discipline_rules')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rules) {
      return new Response(
        JSON.stringify({ ok: true, work_date: workDate, total_absent, notifications_sent, failures, skipped: 'no rules' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Active + tracked staff (club / untracked staff are excluded by attendance_tracked=false)
    const { data: staffList } = await supabase
      .from('staff')
      .select('id, full_name, phone, monthly_salary')
      .eq('is_active', true)
      .eq('attendance_tracked', true);

    if (!staffList || staffList.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, work_date: workDate, total_absent, notifications_sent, failures }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const staffIds = staffList.map((s) => s.id);

    // Yesterday in IST
    const wdDate = new Date(workDate + 'T00:00:00Z');
    const yesterdayDate = new Date(wdDate);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    // Today's IST midnight (in UTC) — used to detect yesterday's sessions that
    // closed today (night shift covered today's morning).
    const todayIstMidnightUtc = new Date(workDate + 'T00:00:00Z');
    todayIstMidnightUtc.setUTCMinutes(todayIstMidnightUtc.getUTCMinutes() - (5 * 60 + 30));

    // Pull all needed lookups in bulk
    const [{ data: assigns }, { data: shifts }, { data: leaves }, { data: sessions }, { data: openSessions }, { data: ySessions }, { data: logs }] =
      await Promise.all([
        supabase
          .from('staff_shift_assignments')
          .select('staff_id, shift_id, override_check_in')
          .in('staff_id', staffIds),
        supabase.from('shifts').select('id, check_in_time'),
        supabase
          .from('leave_records')
          .select('staff_id')
          .eq('leave_date', workDate)
          .eq('status', 'approved')
          .in('staff_id', staffIds),
        supabase
          .from('attendance_sessions')
          .select('staff_id')
          .eq('work_date', workDate)
          .in('staff_id', staffIds),
        // Open sessions (any work_date) that are still active — covers night shift in progress
        supabase
          .from('attendance_sessions')
          .select('staff_id, check_in_at')
          .in('status', ['active', 'on_break'])
          .is('check_out_at', null)
          .in('staff_id', staffIds),
        // Yesterday's sessions whose checkout is on/after today's IST midnight
        supabase
          .from('attendance_sessions')
          .select('staff_id, check_out_at')
          .eq('work_date', yesterday)
          .gte('check_out_at', todayIstMidnightUtc.toISOString())
          .in('staff_id', staffIds),
        supabase
          .from('attendance_discipline_log')
          .select('id, staff_id')
          .eq('work_date', workDate)
          .in('staff_id', staffIds),
      ]);

    const shiftMap = new Map<string, string>(
      (shifts ?? []).map((s: { id: string; check_in_time: string }) => [s.id, s.check_in_time]),
    );
    const assignMap = new Map<string, { shift_id: string | null; override_check_in: string | null }>();
    (assigns ?? []).forEach((a: { staff_id: string; shift_id: string | null; override_check_in: string | null }) => {
      assignMap.set(a.staff_id, { shift_id: a.shift_id, override_check_in: a.override_check_in });
    });
    const leaveSet = new Set((leaves ?? []).map((l: { staff_id: string }) => l.staff_id));
    const sessionSet = new Set((sessions ?? []).map((s: { staff_id: string }) => s.staff_id));
    const openSessionSet = new Set(
      (openSessions ?? []).map((s: { staff_id: string }) => s.staff_id),
    );
    const yesterdaySessionSet = new Set(
      (ySessions ?? []).map((s: { staff_id: string }) => s.staff_id),
    );
    const logMap = new Map<string, string>(
      (logs ?? []).map((l: { id: string; staff_id: string }) => [l.staff_id, l.id]),
    );

    const wd = new Date(workDate + 'T00:00:00');
    const daysInMonth = new Date(wd.getFullYear(), wd.getMonth() + 1, 0).getDate();

    for (const s of staffList as Array<{
      id: string;
      full_name: string;
      phone: string | null;
      monthly_salary: number;
    }>) {
      // Session-aware skip rules:
      //  1) on approved leave today
      //  2) already has a session anchored to today
      //  3) has an open session from any day (still on shift)
      //  4) yesterday's session extended past today's IST midnight (night shift covered today)
      //  5) no shift assignment (can't determine "scheduled")
      if (leaveSet.has(s.id)) continue;
      if (sessionSet.has(s.id)) continue;
      if (openSessionSet.has(s.id)) continue;
      if (yesterdaySessionSet.has(s.id)) continue;
      const a = assignMap.get(s.id);
      if (!a) continue;
      const scheduledIn = a.override_check_in || (a.shift_id ? shiftMap.get(a.shift_id) : null);
      if (!scheduledIn) continue;

      const dailySalary = (Number(s.monthly_salary) || 0) / (daysInMonth || 30);
      const fine = Math.round(
        resolveDeduction(rules.absent_no_checkin_deduction, dailySalary) * 100,
      ) / 100;

      // Insert / upsert discipline log
      const existingId = logMap.get(s.id);
      if (existingId) {
        await supabase
          .from('attendance_discipline_log')
          .update({
            fine_amount: fine,
            fine_reason: 'Absent — no check-in',
            is_absent: true,
            absent_reason: 'no_checkin',
            computed_at: new Date().toISOString(),
          })
          .eq('id', existingId);
      } else {
        await supabase.from('attendance_discipline_log').insert({
          staff_id: s.id,
          work_date: workDate,
          fine_amount: fine,
          fine_reason: 'Absent — no check-in',
          is_absent: true,
          absent_reason: 'no_checkin',
        });
      }
      total_absent++;

    }


    return new Response(
      JSON.stringify({ ok: true, work_date: workDate, total_absent, notifications_sent, failures }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('check-absent-staff error', e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        work_date: workDate,
        total_absent,
        notifications_sent,
        failures,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
