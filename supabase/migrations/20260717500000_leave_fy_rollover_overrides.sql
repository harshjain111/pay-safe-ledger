-- ============================================================================
-- Leave: financial-year setting, per-department/outlet overrides, and a
-- year-end rollover routine.
-- ============================================================================

-- 1. Financial-year start month (1 = Jan / calendar year, default keeps today's
--    behaviour; e.g. 4 = April–March FY). Leave-year windows & rollover use it.
alter table public.organization_profile
  add column if not exists leave_year_start_month int not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'org_leave_year_month_chk') then
    alter table public.organization_profile
      add constraint org_leave_year_month_chk check (leave_year_start_month between 1 and 12);
  end if;
end $$;

-- 2. Advanced settings: per-department / per-outlet overrides for a leave type.
--    quota_override / deduction_override replace the type defaults for staff in
--    that department/outlet; is_exempt removes the type for them entirely.
create table if not exists public.leave_type_overrides (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  scope text not null check (scope in ('department','outlet')),
  department_id uuid references public.departments(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete cascade,
  quota_override numeric,
  deduction_override numeric,
  is_exempt boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lto_scope_ref check (
    (scope = 'department' and department_id is not null and outlet_id is null) or
    (scope = 'outlet'     and outlet_id     is not null and department_id is null)
  )
);
create index if not exists idx_lto_type on public.leave_type_overrides(leave_type_id);

alter table public.leave_type_overrides enable row level security;
drop policy if exists "Read leave_type_overrides" on public.leave_type_overrides;
create policy "Read leave_type_overrides" on public.leave_type_overrides
  for select to authenticated using (true);
drop policy if exists "Manage leave_type_overrides" on public.leave_type_overrides;
create policy "Manage leave_type_overrides" on public.leave_type_overrides
  for all to authenticated
  using      (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'));

-- 3. Year-end rollover: for the target financial year, carry each active staff's
--    prior-FY closing balance of every carry_forward leave type into its opening,
--    capped at max_balance. Non-carry_forward types are not rolled (i.e. reset).
create or replace function public.run_leave_rollover(_target_fy int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_month int;
  v_prev_from date; v_prev_to date;
  v_rows int := 0;
begin
  select coalesce(leave_year_start_month, 1) into v_start_month from public.organization_profile limit 1;
  v_start_month := coalesce(v_start_month, 1);
  v_prev_from := make_date(_target_fy - 1, v_start_month, 1);
  v_prev_to   := make_date(_target_fy,     v_start_month, 1) - 1;

  -- Recompute carry_forward openings for the target FY from scratch.
  delete from public.leave_balances lb
  using public.leave_types t
  where lb.year = _target_fy and lb.leave_type_id = t.id and t.carry_forward = true;

  with used as (
    select r.staff_id, r.leave_type_id, count(*)::numeric as used_days
    from public.leave_records r
    where r.status = 'approved'
      and r.leave_date between v_prev_from and v_prev_to
      and r.leave_type_id is not null
    group by r.staff_id, r.leave_type_id
  ),
  prev_open as (
    select staff_id, leave_type_id, coalesce(opening, 0) as opening
    from public.leave_balances where year = _target_fy - 1
  ),
  computed as (
    select s.id as staff_id, t.id as leave_type_id, t.max_balance,
      greatest(0,
        coalesce(po.opening, 0)
        + case when t.accrual = 'none' then 0 else coalesce(t.default_quota, 0) end
        - coalesce(u.used_days, 0)
      ) as raw_carry
    from public.staff s
    cross join public.leave_types t
    left join prev_open po on po.staff_id = s.id and po.leave_type_id = t.id
    left join used u       on u.staff_id  = s.id and u.leave_type_id  = t.id
    where s.is_active = true and t.is_active = true and t.carry_forward = true
  )
  insert into public.leave_balances (staff_id, leave_type_id, year, opening)
  select staff_id, leave_type_id, _target_fy,
    case when max_balance is not null then least(raw_carry, max_balance) else raw_carry end
  from computed
  where raw_carry > 0;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'target_fy', _target_fy, 'start_month', v_start_month,
    'prev_from', v_prev_from, 'prev_to', v_prev_to, 'openings_written', v_rows);
end;
$$;
revoke all on function public.run_leave_rollover(int) from public, anon;
grant execute on function public.run_leave_rollover(int) to authenticated;
