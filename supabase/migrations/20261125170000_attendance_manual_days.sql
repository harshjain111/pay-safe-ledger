-- Days a person edited by hand are not rebuilt from punches.
--
-- rebuild_sessions_from_punches() recreates a day from punch_events, so a day
-- corrected in Bulk Attendance (its sessions are deleted, then optionally a
-- manual one inserted) came back on the next rebuild: a cleared day reappeared,
-- a manual day gained a second session. Edits by a signed-in user at an outlet
-- with a day start are recorded here and the rebuild skips those days. Delete
-- the row to hand a day back to the punches.

create table if not exists public.attendance_manual_days (
  staff_id        uuid not null references public.staff(id) on delete cascade,
  work_date       date not null,
  organization_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  edited_by       uuid,
  edited_at       timestamptz not null default now(),
  primary key (staff_id, work_date)
);
alter table public.attendance_manual_days enable row level security;
create policy "Owners and admins manage manual days" on public.attendance_manual_days for all to authenticated
  using      (has_role(auth.uid(), 'owner'::app_role) or has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'owner'::app_role) or has_role(auth.uid(), 'admin'::app_role));
create policy tenant_isolation on public.attendance_manual_days as restrictive for all to public
  using      (organization_id in (select public.my_org_ids()) and ((select public.active_org()) is null or organization_id = (select public.active_org())))
  with check (organization_id in (select public.my_org_ids()) and ((select public.active_org()) is null or organization_id = (select public.active_org())));
create trigger trg_org_from_parent before insert or update of staff_id on public.attendance_manual_days
  for each row execute function public.set_org_from_parent('staff', 'staff_id');

create or replace function public.mark_attendance_manual_day()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  -- Only a signed-in user's edit counts; devices, cron and rebuilds do not.
  if auth.uid() is null or current_setting('attendance.rebuilding', true) = 'on' then return null; end if;
  for r in
    select distinct d.staff_id, d.work_date
      from (select case when tg_op <> 'INSERT' then old.staff_id end, case when tg_op <> 'INSERT' then old.work_date end
            union all
            select case when tg_op <> 'DELETE' then new.staff_id end, case when tg_op <> 'DELETE' then new.work_date end
           ) d(staff_id, work_date)
     where d.staff_id is not null
  loop
    if public.staff_uses_day_start(r.staff_id) then
      insert into public.attendance_manual_days (staff_id, work_date, edited_by)
      values (r.staff_id, r.work_date, auth.uid())
      on conflict (staff_id, work_date) do update set edited_by = excluded.edited_by, edited_at = now();
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.mark_attendance_manual_day() from public, anon, authenticated;

create trigger trg_manual_day_delete after delete on public.attendance_sessions
  for each row when (old.source = 'biometric') execute function public.mark_attendance_manual_day();
create trigger trg_manual_day_insert after insert on public.attendance_sessions
  for each row when (new.source = 'manual') execute function public.mark_attendance_manual_day();
create trigger trg_manual_day_update after update of check_in_at, check_out_at, work_date, worked_minutes on public.attendance_sessions
  for each row when (old.source in ('biometric', 'manual') and
    (old.check_in_at, old.check_out_at, old.work_date, old.worked_minutes) is distinct from
    (new.check_in_at, new.check_out_at, new.work_date, new.worked_minutes))
  execute function public.mark_attendance_manual_day();

create or replace function public.rebuild_sessions_from_punches(
  _staff_ids uuid[] default null, _from date default null, _to date default null)
returns jsonb language plpgsql security definer set search_path to 'public' set statement_timeout to '300s' as $$
declare v_deleted int; v_written int;
begin
  -- Marks our own writes, so the manual-edit trigger ignores them even when a
  -- signed-in user caused the rebuild (replay_unmatched_punches).
  perform set_config('attendance.rebuilding', 'on', true);

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
       and not exists (select 1 from public.attendance_manual_days m
                        where m.staff_id = days.staff_id and m.work_date = days.work_date)
     group by staff_id, user_id, today, work_date;

  -- Only sessions made from stored punches may be replaced.
  delete from public.attendance_sessions a
   using pg_temp._dsp_scope sc
   where a.staff_id = sc.staff_id and a.source = 'biometric'
     and (_from is null or a.work_date >= _from) and (_to is null or a.work_date <= _to)
     and not exists (select 1 from public.attendance_manual_days m where m.staff_id = a.staff_id and m.work_date = a.work_date)
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

  perform set_config('attendance.rebuilding', 'off', true);

  return jsonb_build_object('staff', (select count(*) from pg_temp._dsp_scope), 'deleted', v_deleted, 'written', v_written);
end;
$$;
