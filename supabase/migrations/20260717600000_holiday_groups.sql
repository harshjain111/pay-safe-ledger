-- ============================================================================
-- Holidays, unified. A single "holiday" is a named period (one or many days)
-- targeted at everyone or specific departments / outlets / roles. Applying it
-- auto-creates a paid 'Holiday' leave for every in-scope active staff on each
-- day (so it shows in Duty Roster & Bulk Attendance and is never counted
-- absent). Removing it deletes those leaves again.
-- ============================================================================

create table if not exists public.holiday_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  from_date date not null,
  to_date date not null,
  is_paid boolean not null default true,
  applies_to text not null default 'all' check (applies_to in ('all', 'selected')),
  department_ids uuid[] not null default '{}',
  outlet_ids uuid[] not null default '{}',
  roles text[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.holiday_groups enable row level security;
drop policy if exists "Read holiday_groups" on public.holiday_groups;
create policy "Read holiday_groups" on public.holiday_groups for select to authenticated using (true);
drop policy if exists "Manage holiday_groups" on public.holiday_groups;
create policy "Manage holiday_groups" on public.holiday_groups for all to authenticated
  using      (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'));

-- Tag the leaves materialised by a holiday so they can be cleaned up together.
alter table public.leave_records add column if not exists holiday_group_id uuid references public.holiday_groups(id) on delete cascade;
create index if not exists idx_leave_records_holiday on public.leave_records(holiday_group_id);

-- Materialise a holiday group into paid-holiday leaves (+ mark roster off).
create or replace function public.apply_holiday_group(_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.holiday_groups;
  v_type uuid;
  v_n int := 0;
begin
  select * into g from public.holiday_groups where id = _group_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not found'); end if;

  -- Ensure a 'Holiday' leave type exists.
  select id into v_type from public.leave_types where lower(code) = 'hol' or lower(name) = 'holiday' limit 1;
  if v_type is null then
    insert into public.leave_types (name, code, is_paid, accrual, default_quota, default_deduction, is_active)
    values ('Holiday', 'HOL', true, 'none', 0, 0, true)
    returning id into v_type;
  end if;

  -- Recompute from scratch for idempotency.
  delete from public.leave_records where holiday_group_id = _group_id;

  with scoped as (
    select s.id, s.user_id
    from public.staff s
    where s.is_active = true and (
      g.applies_to = 'all'
      or (array_length(g.department_ids, 1) is not null and s.department_id = any(g.department_ids))
      or (array_length(g.outlet_ids, 1) is not null and s.outlet_id = any(g.outlet_ids))
      or (array_length(g.roles, 1) is not null and exists (
        select 1 from public.user_roles ur where ur.user_id = s.user_id and ur.role::text = any(g.roles)
      ))
    )
  ),
  days as (select generate_series(g.from_date, g.to_date, interval '1 day')::date as d),
  ins as (
    insert into public.leave_records
      (staff_id, leave_date, leave_type_id, leave_type, deduction_days, status, remarks, holiday_group_id, created_by, approved_by, approved_at)
    select sc.id, dd.d, v_type,
      (case when g.is_paid then 'paid' else 'unpaid' end)::text,
      (case when g.is_paid then 0 else 1 end),
      'approved', 'Holiday: ' || g.name, _group_id, g.created_by, g.created_by, now()
    from scoped sc cross join days dd
    on conflict (staff_id, leave_date) do nothing
    returning 1
  )
  select count(*) into v_n from ins;

  -- Reflect in the duty roster (mark those days off for in-scope staff).
  insert into public.staff_roster (staff_id, roster_date, shift_id, is_off)
  select sc.id, dd.d, null, true
  from (
    select s.id
    from public.staff s
    where s.is_active = true and (
      g.applies_to = 'all'
      or (array_length(g.department_ids, 1) is not null and s.department_id = any(g.department_ids))
      or (array_length(g.outlet_ids, 1) is not null and s.outlet_id = any(g.outlet_ids))
      or (array_length(g.roles, 1) is not null and exists (
        select 1 from public.user_roles ur where ur.user_id = s.user_id and ur.role::text = any(g.roles)))
    )
  ) sc
  cross join (select generate_series(g.from_date, g.to_date, interval '1 day')::date as d) dd
  on conflict (staff_id, roster_date) do update set is_off = true, shift_id = null;

  return jsonb_build_object('ok', true, 'leaves_created', v_n);
end;
$$;
revoke all on function public.apply_holiday_group(uuid) from public, anon;
grant execute on function public.apply_holiday_group(uuid) to authenticated;

-- Remove a holiday's materialised leaves (the group row is deleted by the caller;
-- the FK cascade also clears the leaves, this is for explicit un-apply).
create or replace function public.remove_holiday_group(_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.leave_records where holiday_group_id = _group_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.remove_holiday_group(uuid) from public, anon;
grant execute on function public.remove_holiday_group(uuid) to authenticated;
