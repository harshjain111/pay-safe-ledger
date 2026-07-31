-- ============================================================================
-- Gap-based sessionization — correct for BOTH day and overnight shifts without a
-- global cutover (which scrambled day workers into fake night sessions).
--
-- Each staff's punch instants are sorted; a new session starts wherever the gap
-- from the previous punch exceeds _max_gap_min (default 12h). A session's
-- check-in = first punch, check-out = last punch, and it's attributed to the
-- CALENDAR date (IST) of the check-in. So:
--   • day 10am–8pm  (10h gap < 12h)  → one session on that day
--   • night 4pm–2am (10h gap < 12h)  → one session on the START day (spans midnight)
--   • the 14h gap to the next day's first punch always splits days apart
-- ============================================================================

-- The org cutover is no longer needed; gap logic handles cross-midnight itself.
update public.organization_profile set attendance_day_start_hour = 0;

create or replace function public.rebuild_sessions_by_gap(_max_gap_min int default 720)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  v_before int; v_after int; v_today date;
begin
  v_today := (now() at time zone 'Asia/Kolkata')::date;
  select count(*) into v_before from public.attendance_sessions where source = 'biometric';

  -- Distinct punch instants per staff (a ts can appear as both an old check-out
  -- and the next old check-in — dedupe so it isn't double-counted).
  create temp table _inst on commit drop as
    select staff_id, max(user_id::text)::uuid as user_id, ts
    from (
      select s.staff_id, s.user_id, v.ts
      from public.attendance_sessions s
      cross join lateral (values (s.check_in_at), (s.check_out_at)) as v(ts)
      where s.source = 'biometric' and v.ts is not null
    ) x
    group by staff_id, ts;

  create temp table _canon on commit drop as
  with ordered as (
    select staff_id, user_id, ts, lag(ts) over (partition by staff_id order by ts) as prev_ts
    from _inst
  ),
  marked as (
    select staff_id, user_id, ts,
      case when prev_ts is null or extract(epoch from (ts - prev_ts)) / 60 > _max_gap_min then 1 else 0 end as new_sess
    from ordered
  ),
  grouped as (
    select staff_id, user_id, ts, sum(new_sess) over (partition by staff_id order by ts) as grp
    from marked
  )
  select staff_id, grp,
    max(user_id::text)::uuid as user_id,
    min(ts) as new_in, max(ts) as new_last,
    (min(ts) at time zone 'Asia/Kolkata')::date as work_date
  from grouped
  group by staff_id, grp;

  delete from public.attendance_sessions where source = 'biometric';

  insert into public.attendance_sessions
    (staff_id, user_id, work_date, check_in_at, check_out_at, worked_minutes, status, source, check_in_photo_url)
  select staff_id, user_id, work_date, new_in,
    case when new_last > new_in then new_last else null end,
    case when new_last > new_in then greatest(0, round(extract(epoch from (new_last - new_in)) / 60))::int else null end,
    case when work_date < v_today then 'completed'
         when new_last > new_in then 'completed'
         else 'active' end,
    'biometric', 'biometric'
  from _canon;

  select count(*) into v_after from public.attendance_sessions where source = 'biometric';
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after, 'max_gap_min', _max_gap_min, 'today', v_today);
end;
$$;

revoke all on function public.rebuild_sessions_by_gap(int) from public, anon, authenticated;
grant execute on function public.rebuild_sessions_by_gap(int) to service_role;

-- Daily full rebuild at 10:17 IST (quiet window: night shift ended, day not
-- started) — self-heals any window-boundary splits the 15-min sync may create.
select cron.unschedule('etl-gap-rebuild-daily') where exists (select 1 from cron.job where jobname = 'etl-gap-rebuild-daily');
select cron.schedule('etl-gap-rebuild-daily', '17 10 * * *', $job$ select public.rebuild_sessions_by_gap(720); $job$);
