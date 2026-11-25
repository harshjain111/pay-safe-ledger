-- Fixed business-day start per outlet, rebuilt from the raw punches.
--
-- rebuild_sessions_by_gap() keeps its punches only as attendance_sessions
-- check-ins/outs, so every run that merges sessions permanently drops the
-- punches in between: 363 of 1,912 recorded Milli Milli punches were no longer
-- in anyone's attendance on 2026-11-25. Its 12h gap / "before 10:00 is a
-- check-out" rules also do not fit Milli Milli, where day staff start at 09:45
-- and evening staff leave after midnight. Nobody punches 08:00-09:00 there, so
-- an 08:00 day start separates the shifts.
--
-- outlets.attendance_day_start_hour NULL (every other outlet) = unchanged.

alter table public.outlets add column if not exists attendance_day_start_hour smallint
  check (attendance_day_start_hour between 0 and 23);
comment on column public.outlets.attendance_day_start_hour is
  'IST hour the attendance day starts at. Set: sessions are rebuilt from punch_events, one per person per day. NULL: gap-based sessions.';

create or replace function public.staff_uses_day_start(_staff_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.staff s join public.outlets o on o.id = s.outlet_id
                  where s.id = _staff_id and o.attendance_day_start_hour is not null)
$$;
revoke all on function public.staff_uses_day_start(uuid) from public, anon, authenticated;
grant execute on function public.staff_uses_day_start(uuid) to service_role;

create or replace function public.rebuild_sessions_from_punches(
  _staff_ids uuid[] default null, _from date default null, _to date default null)
returns jsonb language plpgsql security definer set search_path to 'public' set statement_timeout to '300s' as $$
declare v_deleted int; v_written int;
begin
  perform pg_advisory_xact_lock(hashtext('device_punch:' || s.id::text))
    from (select st.id from public.staff st join public.outlets o on o.id = st.outlet_id
           where o.attendance_day_start_hour is not null
             and (_staff_ids is null or st.id = any(_staff_ids))
           order by st.id) s;

  drop table if exists pg_temp._dsp_scope, pg_temp._dsp_canon;
  create temp table _dsp_scope on commit drop as
    select st.id as staff_id, st.user_id, o.attendance_day_start_hour as h,
           ((now() at time zone 'Asia/Kolkata') - make_interval(hours => o.attendance_day_start_hour))::date as today
      from public.staff st join public.outlets o on o.id = st.outlet_id
     where o.attendance_day_start_hour is not null
       and (_staff_ids is null or st.id = any(_staff_ids));

  create temp table _dsp_canon on commit drop as
    with p as (
      select sc.*, pe.ts, lag(pe.ts) over (partition by sc.staff_id order by pe.ts) as prev
        from pg_temp._dsp_scope sc
        join public.punch_events pe on pe.staff_id = sc.staff_id and pe.method in ('biometric', 'face')
    ), days as (
      select staff_id, user_id, today,
             ((ts at time zone 'Asia/Kolkata') - make_interval(hours => h))::date as work_date, ts
        from p where prev is null or ts - prev > interval '5 minutes'
    )
    select staff_id, user_id, today, work_date, min(ts) as t_in, nullif(max(ts), min(ts)) as t_out
      from days
     where (_from is null or work_date >= _from) and (_to is null or work_date <= _to)
     group by staff_id, user_id, today, work_date;

  -- Only sessions made from stored punches may be replaced.
  delete from public.attendance_sessions a
   using pg_temp._dsp_scope sc
   where a.staff_id = sc.staff_id and a.source = 'biometric'
     and (_from is null or a.work_date >= _from) and (_to is null or a.work_date <= _to)
     and exists (select 1 from public.punch_events pe where pe.staff_id = a.staff_id and pe.ts = a.check_in_at)
     and not exists (select 1 from pg_temp._dsp_canon c where c.staff_id = a.staff_id and c.t_in = a.check_in_at);
  get diagnostics v_deleted = row_count;

  update public.attendance_sessions a set status = 'completed'
    from pg_temp._dsp_scope sc
   where a.staff_id = sc.staff_id and a.source = 'biometric'
     and a.status in ('active', 'on_break') and a.work_date < sc.today;

  insert into public.attendance_sessions as a
    (staff_id, user_id, work_date, check_in_at, check_out_at, worked_minutes, status, source, check_in_photo_url)
  select c.staff_id, c.user_id, c.work_date, c.t_in, c.t_out,
         round(extract(epoch from (c.t_out - c.t_in)) / 60)::int,
         case when c.t_out is null and c.work_date = c.today
               and not exists (select 1 from public.attendance_sessions x
                                where x.user_id = c.user_id and x.status in ('active', 'on_break')
                                  and x.check_in_at <> c.t_in)
              then 'active' else 'completed' end,
         'biometric', 'biometric'
    from pg_temp._dsp_canon c
  on conflict (staff_id, check_in_at) do update
     set work_date = excluded.work_date, check_out_at = excluded.check_out_at,
         worked_minutes = excluded.worked_minutes, status = excluded.status
   where a.source = 'biometric'
     and (a.work_date, a.check_out_at, a.worked_minutes, a.status)
         is distinct from (excluded.work_date, excluded.check_out_at, excluded.worked_minutes, excluded.status);
  get diagnostics v_written = row_count;

  return jsonb_build_object('staff', (select count(*) from pg_temp._dsp_scope), 'deleted', v_deleted, 'written', v_written);
end;
$$;
revoke all on function public.rebuild_sessions_from_punches(uuid[], date, date) from public, anon, authenticated;
grant execute on function public.rebuild_sessions_from_punches(uuid[], date, date) to service_role;

CREATE OR REPLACE FUNCTION public.rebuild_sessions_by_gap(_max_gap_min integer DEFAULT 720)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_before int; v_after int; v_today date;
  v_morning_end int := 10;    -- IST hour before which no shift starts here
  v_late_merge  int := 1200;  -- minutes (20h): attach a trailing early-morning checkout this far back
  v_dedup_sec   int := 300;   -- punches <= 5 min apart are the same punch
begin
  v_today := (now() at time zone 'Asia/Kolkata')::date;
  select count(*) into v_before from public.attendance_sessions where source = 'biometric' and not public.staff_uses_day_start(staff_id);

  -- Distinct punch instants per staff (dedupe exact-equal timestamps).
  create temp table _inst on commit drop as
    select staff_id, max(user_id::text)::uuid as user_id, ts
    from (
      select s.staff_id, s.user_id, v.ts
      from public.attendance_sessions s
      cross join lateral (values (s.check_in_at), (s.check_out_at)) as v(ts)
      where s.source = 'biometric' and v.ts is not null and not public.staff_uses_day_start(s.staff_id)
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

  delete from public.attendance_sessions where source = 'biometric' and not public.staff_uses_day_start(staff_id);

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

  select count(*) into v_after from public.attendance_sessions where source = 'biometric' and not public.staff_uses_day_start(staff_id);
  perform public.rebuild_sessions_from_punches();

  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after,
    'max_gap_min', _max_gap_min, 'morning_end_hour', v_morning_end, 'dedup_sec', v_dedup_sec, 'today', v_today);
end;
$function$;

CREATE OR REPLACE FUNCTION public.consolidate_biometric_attendance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_h     int;
  v_today date;
  v_before int;
  v_after  int;
begin
  select coalesce(attendance_day_start_hour, 0) into v_h from public.organization_profile limit 1;
  v_h := coalesce(v_h, 0);
  v_today := ((now() at time zone 'Asia/Kolkata') - make_interval(hours => v_h))::date;

  select count(*) into v_before from public.attendance_sessions where source = 'biometric' and not public.staff_uses_day_start(staff_id);

  create temp table _canon on commit drop as
  with punches as (
    select s.staff_id, s.user_id, v.ts,
           ((v.ts at time zone 'Asia/Kolkata') - make_interval(hours => v_h))::date as bday
    from public.attendance_sessions s
    cross join lateral (values (s.check_in_at), (s.check_out_at)) as v(ts)
    where s.source = 'biometric' and v.ts is not null and not public.staff_uses_day_start(s.staff_id)
  )
  select staff_id,
         bday                     as work_date,
         max(user_id::text)::uuid as user_id,
         min(ts)                  as new_in,
         max(ts)                  as new_last
  from punches
  group by staff_id, bday;

  delete from public.attendance_sessions where source = 'biometric' and not public.staff_uses_day_start(staff_id);

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

  select count(*) into v_after from public.attendance_sessions where source = 'biometric' and not public.staff_uses_day_start(staff_id);
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after, 'today', v_today, 'day_start_hour', v_h);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_device_punch(_staff_id uuid, _device_id uuid, _ts timestamp with time zone, _method text DEFAULT 'biometric'::text, _raw_ref text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dedup      interval := interval '5 minutes';
  v_gap        interval := interval '12 hours';
  v_reach      interval;
  v_allowed    interval;
  v_user_id    uuid;
  v_outlet_id  uuid;
  v_punch_id   uuid;
  v_sess       public.attendance_sessions%rowtype;
  v_last       timestamptz;
  v_work_date  date;
  v_ist_hour   int;
  v_action     text;
  v_direction  text := 'in';
  v_sess_id    uuid;
  v_day_start  int;
begin
  if _method not in ('biometric', 'face') then _method := 'biometric'; end if;

  select user_id into v_user_id from public.staff where id = _staff_id;
  if not found then return 'unknown-staff'; end if;
  select outlet_id into v_outlet_id from public.biometric_devices where id = _device_id;

  -- Serialise punches for one person so two concurrent pushes cannot both open
  -- a session.
  perform pg_advisory_xact_lock(hashtext('device_punch:' || _staff_id::text));

  -- 1. raw punch log (idempotency gate)
  insert into public.punch_events (staff_id, device_id, ts, direction, method, raw_ref, outlet_id)
  values (_staff_id, _device_id, _ts, 'in', _method, _raw_ref, v_outlet_id)
  on conflict on constraint punch_events_dedup_unique do nothing
  returning id into v_punch_id;
  if v_punch_id is null then return 'already-recorded'; end if;

  -- Outlets with a fixed day start: rebuild that person's business day.
  select o.attendance_day_start_hour into v_day_start
    from public.staff s join public.outlets o on o.id = s.outlet_id
   where s.id = _staff_id;
  if v_day_start is not null then
    v_work_date := ((_ts at time zone 'Asia/Kolkata') - make_interval(hours => v_day_start))::date;
    perform public.rebuild_sessions_from_punches(array[_staff_id], v_work_date, v_work_date);

    select * into v_sess from public.attendance_sessions
     where staff_id = _staff_id and source = 'biometric' and work_date = v_work_date
     limit 1;
    v_action := case when v_sess.check_in_at = _ts then 'check-in'
                     when v_sess.check_out_at = _ts then 'check-out'
                     else 'duplicate' end;

    update public.punch_events
       set session_id = v_sess.id,
           direction = case when v_action = 'check-out' then 'out' else 'in' end
     where id = v_punch_id;
    update public.biometric_devices set last_seen_at = now(), status = 'online' where id = _device_id;
    return v_action;
  end if;

  v_ist_hour := extract(hour from (_ts at time zone 'Asia/Kolkata'));
  v_reach := case when v_ist_hour < 10 then interval '20 hours' else v_gap end;

  -- 2. the device session this punch could belong to: the latest one that
  --    whose last punch is within the window before this one (or that starts
  --    just after it, for a punch that arrives out of order).
  select * into v_sess
    from public.attendance_sessions
   where staff_id = _staff_id
     and source = 'biometric'
     and check_in_at <= _ts + v_gap
     and coalesce(check_out_at, check_in_at) >= _ts - v_reach
   order by check_in_at desc
   limit 1
   for update;

  if found then
    v_last := coalesce(v_sess.check_out_at, v_sess.check_in_at);
    v_allowed := case when v_sess.check_out_at is null then v_reach else v_gap end;

    if _ts between v_sess.check_in_at - v_dedup and v_last + v_dedup then
      -- confirm-tap, or a punch already inside the session's span
      v_action := 'duplicate';
      v_sess_id := v_sess.id;

    elsif _ts > v_last and _ts - v_last <= v_allowed then
      update public.attendance_sessions
         set check_out_at   = _ts,
             worked_minutes = greatest(0, round(extract(epoch from (_ts - check_in_at)) / 60))::int,
             status         = 'completed'
       where id = v_sess.id;
      v_action := case when v_sess.check_out_at is null then 'check-out' else 'check-out-moved' end;
      v_direction := 'out';
      v_sess_id := v_sess.id;

    elsif _ts < v_sess.check_in_at and v_last - _ts <= v_gap then
      -- an earlier punch arriving late: it becomes the check-in
      update public.attendance_sessions
         set check_in_at    = _ts,
             check_out_at   = v_last,
             worked_minutes = greatest(0, round(extract(epoch from (v_last - _ts)) / 60))::int,
             status         = 'completed',
             work_date      = (_ts at time zone 'Asia/Kolkata')::date
       where id = v_sess.id;
      v_action := 'check-in-moved';
      v_sess_id := v_sess.id;
    end if;
  end if;

  -- 3. otherwise, a new session
  if v_sess_id is null then
    v_work_date := (_ts at time zone 'Asia/Kolkata')::date;

    -- Any earlier session still open for this person was a single punch with no
    -- check-out; close it (check-out stays empty, as the rebuild does).
    update public.attendance_sessions
       set status = 'completed'
     where staff_id = _staff_id
       and source = 'biometric'
       and status in ('active', 'on_break')
       and check_in_at < _ts;

    begin
      insert into public.attendance_sessions
        (staff_id, user_id, work_date, check_in_at, check_in_photo_url, status, source)
      values
        (_staff_id, v_user_id, v_work_date, _ts, 'biometric', 'active', 'biometric')
      returning id into v_sess_id;
    exception when unique_violation then
      -- An open in-app session for the same login, or the identical check-in
      -- already exists. Record the punch as a closed session instead of failing.
      insert into public.attendance_sessions
        (staff_id, user_id, work_date, check_in_at, check_in_photo_url, status, source)
      values
        (_staff_id, v_user_id, v_work_date, _ts, 'biometric', 'completed', 'biometric')
      on conflict do nothing
      returning id into v_sess_id;
    end;
    v_action := 'check-in';
  end if;

  update public.punch_events set session_id = v_sess_id, direction = v_direction where id = v_punch_id;

  update public.biometric_devices
     set last_seen_at = now(), status = 'online'
   where id = _device_id;

  return v_action;
end;
$function$;

update public.outlets set attendance_day_start_hour = 8
 where name = 'MILLI MILLI' and organization_id = public.default_organization_id();
