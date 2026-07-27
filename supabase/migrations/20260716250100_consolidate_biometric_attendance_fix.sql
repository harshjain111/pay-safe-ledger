-- Fix: Postgres has no max(uuid) aggregate. Pick any non-null user_id per group
-- via max(user_id::text)::uuid. Redefines consolidate_biometric_attendance()
-- (see 20260716250000 for the full description).

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
    max(user_id::text)::uuid as user_id,   -- any non-null user_id (no max(uuid) agg)
    min(ts)                  as new_in,
    max(ts)                  as new_last
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
    case when c.work_date < v_today then 'completed'
         when c.new_last > c.new_in then 'completed'
         else 'active' end,
    'biometric',
    'biometric'
  from _canon c;

  select count(*) into v_after from public.attendance_sessions where source = 'biometric';
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after, 'today', v_today);
end;
$$;
