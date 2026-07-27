-- ============================================================================
-- Repair biometric attendance: ONE session per (staff, work_date).
--
-- The eSSL "Att State" (Check-In/Check-Out) flag is unreliable — often blank —
-- so the original direction-based pairing left ~47% of sessions unclosed
-- ("active" forever) and mis-paired ~1.5% across midnight (>16h). This rebuilds
-- every biometric day from its own punch instants: check_in = first punch,
-- check_out = last punch of THAT day (IST). Days with a single punch are
-- "present, checkout unknown"; only a today session may remain open.
--
-- Raw punch times are preserved in the existing sessions' check_in_at /
-- check_out_at columns, so no re-pull from the device is required. Only
-- source='biometric' rows are touched (live app sessions are left alone).
-- attendance_breaks (ON DELETE CASCADE) is never populated for biometric
-- imports, so the rebuild removes no break data.
--
-- SECURITY DEFINER + service_role-only (invoked by the connector).
-- ============================================================================

create or replace function public.consolidate_biometric_attendance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_before int;
  v_after  int;
begin
  select count(*) into v_before from public.attendance_sessions where source = 'biometric';

  -- Unpivot each session into its punch instants, keep only those whose IST date
  -- matches the session's work_date (drops cross-midnight mis-pairs), then take
  -- first + last punch per (staff, day).
  create temp table _canon on commit drop as
  with punches as (
    select s.staff_id, s.work_date, s.user_id, v.ts
    from public.attendance_sessions s
    cross join lateral (values (s.check_in_at), (s.check_out_at)) as v(ts)
    where s.source = 'biometric'
      and v.ts is not null
      and (v.ts at time zone 'Asia/Kolkata')::date = s.work_date
  )
  select
    staff_id,
    work_date,
    max(user_id) as user_id,   -- any non-null user_id for this staff/day
    min(ts)      as new_in,
    max(ts)      as new_last
  from punches
  group by staff_id, work_date;

  delete from public.attendance_sessions where source = 'biometric';

  insert into public.attendance_sessions
    (staff_id, user_id, work_date, check_in_at, check_out_at, worked_minutes, status, source, check_in_photo_url)
  select
    c.staff_id,
    c.user_id,
    c.work_date,
    c.new_in,
    case when c.new_last > c.new_in then c.new_last else null end,
    case when c.new_last > c.new_in
         then greatest(0, round(extract(epoch from (c.new_last - c.new_in)) / 60))::int
         else null end,
    case when c.work_date < v_today then 'completed'          -- past day: always done
         when c.new_last > c.new_in then 'completed'          -- today with 2+ punches: done
         else 'active' end,                                   -- today, single punch: still in
    'biometric',
    'biometric'
  from _canon c;

  select count(*) into v_after from public.attendance_sessions where source = 'biometric';
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after, 'today', v_today);
end;
$$;

revoke all on function public.consolidate_biometric_attendance() from public, anon, authenticated;
grant execute on function public.consolidate_biometric_attendance() to service_role;
