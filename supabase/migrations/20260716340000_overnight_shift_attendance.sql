-- ============================================================================
-- Overnight / cross-midnight shift support (e.g. 4 PM – 2 AM).
--
-- Attendance is attributed to a BUSINESS DAY that starts at
-- attendance_day_start_hour (IST) instead of calendar midnight. A punch belongs
-- to business day = date((ts at IST) - day_start_hour hours). So a 4pm check-in
-- and a 2am (next-day) check-out both fall on the SAME business day = the shift's
-- start date, giving one clean session. day_start_hour=0 is the classic
-- calendar-day behaviour (day shifts).
-- ============================================================================

alter table public.organization_profile
  add column if not exists attendance_day_start_hour int not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'org_day_start_hour_chk') then
    alter table public.organization_profile
      add constraint org_day_start_hour_chk check (attendance_day_start_hour between 0 and 23);
  end if;
end $$;

-- Konnect 2 works 4pm–2am → roll the business day at 11:00 (safely inside the
-- 2am–4pm off-window), so both punches attribute to the shift's start date.
update public.organization_profile
set attendance_day_start_hour = 11
where trade_name = 'Konnect 2 Hospitality';

-- Rebuild: one session per (staff, BUSINESS day). Reads day_start_hour from the
-- org profile; groups every punch instant by its business day (handles day AND
-- overnight shifts). Replaces the old same-calendar-day filter.
create or replace function public.consolidate_biometric_attendance()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  v_h     int;
  v_today date;
  v_before int;
  v_after  int;
begin
  select coalesce(attendance_day_start_hour, 0) into v_h from public.organization_profile limit 1;
  v_h := coalesce(v_h, 0);
  v_today := ((now() at time zone 'Asia/Kolkata') - make_interval(hours => v_h))::date;

  select count(*) into v_before from public.attendance_sessions where source = 'biometric';

  create temp table _canon on commit drop as
  with punches as (
    select s.staff_id, s.user_id, v.ts,
           ((v.ts at time zone 'Asia/Kolkata') - make_interval(hours => v_h))::date as bday
    from public.attendance_sessions s
    cross join lateral (values (s.check_in_at), (s.check_out_at)) as v(ts)
    where s.source = 'biometric' and v.ts is not null
  )
  select staff_id,
         bday                     as work_date,
         max(user_id::text)::uuid as user_id,
         min(ts)                  as new_in,
         max(ts)                  as new_last
  from punches
  group by staff_id, bday;

  delete from public.attendance_sessions where source = 'biometric';

  insert into public.attendance_sessions
    (staff_id, user_id, work_date, check_in_at, check_out_at, worked_minutes, status, source, check_in_photo_url)
  select
    c.staff_id, c.user_id, c.work_date, c.new_in,
    case when c.new_last > c.new_in then c.new_last else null end,
    case when c.new_last > c.new_in then greatest(0, round(extract(epoch from (c.new_last - c.new_in)) / 60))::int else null end,
    case when c.work_date < v_today then 'completed'
         when c.new_last > c.new_in then 'completed'
         else 'active' end,
    'biometric', 'biometric'
  from _canon c;

  select count(*) into v_after from public.attendance_sessions where source = 'biometric';
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after, 'today', v_today, 'day_start_hour', v_h);
end;
$$;
