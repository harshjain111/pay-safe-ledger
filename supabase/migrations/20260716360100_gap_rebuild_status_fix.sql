-- Fix: attendance_sessions_one_open_per_user allows only ONE active session per
-- user, but a staff can have two open lone punches today (>12h apart). Mark only
-- each staff's LATEST open-today session as 'active'; everything else 'completed'.
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
    select staff_id, user_id, ts, lag(ts) over (partition by staff_id order by ts) as prev_ts from _inst
  ),
  marked as (
    select staff_id, user_id, ts,
      case when prev_ts is null or extract(epoch from (ts - prev_ts)) / 60 > _max_gap_min then 1 else 0 end as new_sess
    from ordered
  ),
  grouped as (
    select staff_id, user_id, ts, sum(new_sess) over (partition by staff_id order by ts) as grp from marked
  )
  select staff_id, grp, max(user_id::text)::uuid as user_id,
    min(ts) as new_in, max(ts) as new_last,
    (min(ts) at time zone 'Asia/Kolkata')::date as work_date
  from grouped group by staff_id, grp;

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
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after, 'max_gap_min', _max_gap_min, 'today', v_today);
end;
$$;
