-- ============================================================================
-- Gap sessionization — coalesce confirm-taps within 5 minutes.
--
-- People sometimes punch twice within a minute or two "just to be sure". Those
-- near-simultaneous punches must count as ONE punch, not as a check-in/check-out
-- pair (which produced fake 2-minute shifts). Before islanding, cluster each
-- staff's punches that are <= 5 minutes apart and keep the earliest of each
-- cluster. Everything else (night-org early-morning merge, 12h islanding) is
-- unchanged from 20260717300000.
-- ============================================================================

create or replace function public.rebuild_sessions_by_gap(_max_gap_min int default 720)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  v_before int; v_after int; v_today date;
  v_morning_end int := 10;    -- IST hour before which no shift starts here
  v_late_merge  int := 1200;  -- minutes (20h): attach a trailing early-morning checkout this far back
  v_dedup_sec   int := 300;   -- punches <= 5 min apart are the same punch
begin
  v_today := (now() at time zone 'Asia/Kolkata')::date;
  select count(*) into v_before from public.attendance_sessions where source = 'biometric';

  -- Distinct punch instants per staff (dedupe exact-equal timestamps).
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
  -- Step 1: coalesce confirm-taps — cluster punches <= v_dedup_sec apart, keep
  -- the earliest instant of each cluster.
  with d_ordered as (
    select staff_id, user_id, ts, lag(ts) over (partition by staff_id order by ts) as p
    from _inst
  ),
  d_marked as (
    select staff_id, user_id, ts,
      case when p is null or extract(epoch from (ts - p)) > v_dedup_sec then 1 else 0 end as new_cluster
    from d_ordered
  ),
  d_grouped as (
    select staff_id, user_id, ts, sum(new_cluster) over (partition by staff_id order by ts) as cl
    from d_marked
  ),
  coalesced as (
    select staff_id, max(user_id::text)::uuid as user_id, min(ts) as ts
    from d_grouped
    group by staff_id, cl
  ),
  -- Step 2: 12h islanding with the night-org early-morning merge.
  ordered as (
    select staff_id, user_id, ts, lag(ts) over (partition by staff_id order by ts) as prev_ts
    from coalesced
  ),
  marked as (
    select staff_id, user_id, ts,
      case
        when prev_ts is null then 1
        when extract(epoch from (ts - prev_ts)) / 60 > _max_gap_min
             and not (
               extract(hour from (ts at time zone 'Asia/Kolkata')) < v_morning_end
               and extract(epoch from (ts - prev_ts)) / 60 <= v_late_merge
             )
        then 1
        else 0
      end as new_sess
    from ordered
  ),
  grouped as (
    select staff_id, user_id, ts,
      sum(new_sess) over (partition by staff_id order by ts) as grp
    from marked
  ),
  sess as (
    select staff_id, grp, max(user_id::text)::uuid as user_id,
      min(ts) as new_in, max(ts) as new_last
    from grouped
    group by staff_id, grp
  )
  select staff_id, grp, user_id, new_in, new_last,
    case
      when new_last = new_in
           and extract(hour from (new_in at time zone 'Asia/Kolkata')) < v_morning_end
      then ((new_in at time zone 'Asia/Kolkata')::date - 1)
      else (new_in at time zone 'Asia/Kolkata')::date
    end as work_date
  from sess;

  delete from public.attendance_sessions where source = 'biometric';

  insert into public.attendance_sessions
    (staff_id, user_id, work_date, check_in_at, check_out_at, worked_minutes, status, source, check_in_photo_url)
  select staff_id, user_id, work_date, new_in,
    case when new_last > new_in then new_last else null end,
    case when new_last > new_in then greatest(0, round(extract(epoch from (new_last - new_in)) / 60))::int else null end,
    case when new_last > new_in then 'completed'
         when work_date < v_today then 'completed'
         when row_number() over (partition by staff_id order by new_in desc) = 1 then 'active'
         else 'completed' end,
    'biometric', 'biometric'
  from _canon;

  select count(*) into v_after from public.attendance_sessions where source = 'biometric';
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after,
    'max_gap_min', _max_gap_min, 'morning_end_hour', v_morning_end, 'dedup_sec', v_dedup_sec, 'today', v_today);
end;
$$;

revoke all on function public.rebuild_sessions_by_gap(int) from public, anon, authenticated;
grant execute on function public.rebuild_sessions_by_gap(int) to service_role;

-- Rebuild with the coalescing rule applied.
select public.rebuild_sessions_by_gap(720);
