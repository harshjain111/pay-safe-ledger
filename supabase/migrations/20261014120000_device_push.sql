-- ============================================================================
-- Direct cloud push from biometric terminals (BioMax N-series / fk_device "R6").
--
-- The terminal POSTs each punch straight to the website (/AIData.aspx, served
-- by api/device-push.ts on Vercel) over the internet, so no PC is needed on the
-- device's network. This migration adds what that endpoint needs.
--
--   1. staff.device_user_id   the number the terminal uses for a person (its
--                             "User ID"), when that is not the employee code.
--                             Terminals that only accept digits send e.g. "1".
--   2. biometric_devices.push_token_hash
--                             the terminal sends a fixed `token` header with
--                             every push. Its hash is pinned on first contact
--                             and every later push must match it, so knowing a
--                             serial number alone is not enough to post punches.
--   3. device_unmatched_punches
--                             punches whose User ID matches no staff member.
--                             They are acknowledged to the terminal (otherwise
--                             it re-sends them forever and blocks every punch
--                             queued behind) and kept here so nothing is lost:
--                             mapping the User ID later replays them.
--
-- (Supersedes the uncommitted 20261010120000_staff_device_user_id.sql, whose
-- version number collided with 20261010120000_tenant_isolation.sql.)
-- ============================================================================

-- ---- 1. staff.device_user_id -------------------------------------------------
alter table public.staff add column if not exists device_user_id text;

drop index if exists public.staff_device_user_id_key;

-- One device number can never point at two people within an organisation.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'staff'
               and column_name = 'organization_id') then
    execute 'create unique index if not exists staff_org_device_user_id_key
               on public.staff (organization_id, device_user_id)
               where device_user_id is not null';
  else
    execute 'create unique index if not exists staff_device_user_id_key
               on public.staff (device_user_id)
               where device_user_id is not null';
  end if;
end $$;

-- ---- 2. biometric_devices.push_token_hash -----------------------------------
alter table public.biometric_devices add column if not exists push_token_hash text;

-- ---- 3. device_unmatched_punches --------------------------------------------
create table if not exists public.device_unmatched_punches (
  id             uuid primary key default gen_random_uuid(),
  device_id      uuid not null references public.biometric_devices(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  device_user_id text not null,
  ts             timestamptz not null,
  verify_mode    text,
  raw            jsonb,
  -- set when the punch is later replayed into punch_events for a staff member
  resolved_staff_id uuid references public.staff(id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint device_unmatched_punches_dedup unique (device_id, device_user_id, ts)
);

create index if not exists device_unmatched_punches_open_idx
  on public.device_unmatched_punches (device_id, device_user_id)
  where resolved_at is null;

alter table public.device_unmatched_punches enable row level security;

-- Written only by the push endpoint (service role, bypasses RLS). Owners and
-- admins can read it to see which device User IDs still need mapping.
drop policy if exists "Owners and admins view unmatched punches" on public.device_unmatched_punches;
create policy "Owners and admins view unmatched punches"
  on public.device_unmatched_punches for select to authenticated
  using (has_role(auth.uid(), 'owner'::app_role) or has_role(auth.uid(), 'admin'::app_role));

-- Tenant isolation, the same restrictive policy every other table carries.
drop policy if exists tenant_isolation on public.device_unmatched_punches;
create policy tenant_isolation on public.device_unmatched_punches as restrictive for all to public
  using (
    organization_id in (select public.my_org_ids())
    and ((select public.active_org()) is null or organization_id = (select public.active_org()))
  )
  with check (
    organization_id in (select public.my_org_ids())
    and ((select public.active_org()) is null or organization_id = (select public.active_org()))
  );

-- ---- 4. apply_device_punch: one punch -> attendance_sessions -----------------
-- The terminal does not know whether a punch is an arrival or a departure (it
-- reports every punch as "IN"), so direction is derived from timing with the
-- SAME rules rebuild_sessions_by_gap() uses for imported punches:
--   * punches <= 5 min after the previous one are a confirm-tap: ignored;
--   * a punch <= 12h after the session's last punch extends it (it becomes the
--     check-out; a third punch moves the check-out later);
--   * before 10:00 IST, a session that has no check-out yet stays joinable for
--     20h, so a long night shift's early-morning check-out joins the session
--     that started the evening before (a session that already has a check-out
--     is never extended into the next morning);
--   * otherwise the punch opens a new session on its IST calendar date.
-- Sessions are written with source = 'biometric' so rebuild_sessions_by_gap()
-- treats them exactly like imported ones.
--
-- Idempotent: punch_events is UNIQUE (device_id, ts, staff_id), so a punch the
-- terminal re-sends is recognised and changes nothing.
create or replace function public.apply_device_punch(
  _staff_id  uuid,
  _device_id uuid,
  _ts        timestamptz,
  _method    text default 'biometric',
  _raw_ref   text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.apply_device_punch(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.apply_device_punch(uuid, uuid, timestamptz, text, text) to service_role;

-- ---- 5. replay_unmatched_punches: after a User ID is mapped -----------------
-- Called from Biometric Enrolment after an admin sets a staff member's device
-- User ID. Any punches that arrived before the mapping are applied in time order.
create or replace function public.replay_unmatched_punches(_staff_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_org   uuid;
  v_emp   text;
  r       record;
  n       int := 0;
begin
  if not (has_role(auth.uid(), 'owner'::app_role)
          or has_role(auth.uid(), 'admin'::app_role)
          or has_role(auth.uid(), 'hr'::app_role)) then
    raise exception 'not allowed';
  end if;

  select device_user_id, employee_id, organization_id into v_code, v_emp, v_org
    from public.staff where id = _staff_id;
  if not found then return 0; end if;
  if v_org is not null and v_org not in (select public.my_org_ids()) then
    raise exception 'not allowed';
  end if;

  for r in
    select u.id, u.device_id, u.ts, u.verify_mode
      from public.device_unmatched_punches u
      join public.biometric_devices d on d.id = u.device_id
     where u.resolved_at is null
       and u.device_user_id in (v_code, v_emp)
       and (v_org is null or d.organization_id = v_org)
     order by u.ts
  loop
    perform public.apply_device_punch(
      _staff_id, r.device_id, r.ts,
      case when lower(coalesce(r.verify_mode, '')) = 'face' then 'face' else 'biometric' end,
      'replay:' || r.id::text);
    update public.device_unmatched_punches
       set resolved_staff_id = _staff_id, resolved_at = now()
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.replay_unmatched_punches(uuid) from public, anon;
grant execute on function public.replay_unmatched_punches(uuid) to authenticated;

-- ---- 6. live updates ---------------------------------------------------------
-- The website subscribes to attendance_sessions over Supabase Realtime so a
-- punch on the terminal shows up on open screens without a reload. Realtime
-- still applies RLS: each viewer only receives rows they may read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'attendance_sessions') then
    execute 'alter publication supabase_realtime add table public.attendance_sessions';
  end if;
end $$;
