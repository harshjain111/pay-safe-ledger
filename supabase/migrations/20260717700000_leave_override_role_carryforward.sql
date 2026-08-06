-- ============================================================================
-- Advanced leave-type rules, extended:
--   * a third override scope: 'role' (via staff's user_roles).
--   * carry_forward_override — per department/outlet/role: who carries a type
--     forward and who doesn't (null = inherit the type's own setting).
--   * seed a 'Weekly Off' leave type so weekly-off can be treated as a type.
-- Rollover now honours the per-scope carry-forward decision.
-- ============================================================================

alter table public.leave_type_overrides add column if not exists role_type text;
alter table public.leave_type_overrides add column if not exists carry_forward_override boolean;

alter table public.leave_type_overrides drop constraint if exists leave_type_overrides_scope_check;
alter table public.leave_type_overrides add constraint leave_type_overrides_scope_check check (scope in ('department', 'outlet', 'role'));

alter table public.leave_type_overrides drop constraint if exists lto_scope_ref;
alter table public.leave_type_overrides add constraint lto_scope_ref check (
  (scope = 'department' and department_id is not null and outlet_id is null and role_type is null) or
  (scope = 'outlet'     and outlet_id     is not null and department_id is null and role_type is null) or
  (scope = 'role'       and role_type     is not null and department_id is null and outlet_id is null)
);

-- Seed a Weekly Off leave type (non-accruing, paid, no carry-forward by default).
insert into public.leave_types (name, code, is_paid, accrual, default_quota, default_deduction, carry_forward, is_active)
select 'Weekly Off', 'WO', true, 'none', 0, 0, false, true
where not exists (select 1 from public.leave_types where lower(code) = 'wo' or lower(name) = 'weekly off');

-- Rollover honouring per-scope carry-forward.
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

  -- Recompute all openings for the target FY from prior-year closing balances.
  delete from public.leave_balances where year = _target_fy;

  with used as (
    select r.staff_id, r.leave_type_id, count(*)::numeric as used_days
    from public.leave_records r
    where r.status = 'approved' and r.leave_date between v_prev_from and v_prev_to and r.leave_type_id is not null
    group by r.staff_id, r.leave_type_id
  ),
  prev_open as (
    select staff_id, leave_type_id, coalesce(opening, 0) as opening
    from public.leave_balances where year = _target_fy - 1
  ),
  staff_types as (
    select s.id as staff_id, s.department_id, s.outlet_id, s.user_id,
           t.id as leave_type_id, t.max_balance, t.default_quota, t.accrual, t.carry_forward as type_cf
    from public.staff s cross join public.leave_types t
    where s.is_active = true and t.is_active = true
  ),
  eff as (
    select st.*, coalesce((
      select o.carry_forward_override
      from public.leave_type_overrides o
      where o.leave_type_id = st.leave_type_id and o.is_active and o.carry_forward_override is not null and (
        (o.scope = 'department' and o.department_id = st.department_id) or
        (o.scope = 'outlet'     and o.outlet_id     = st.outlet_id) or
        (o.scope = 'role'       and exists (select 1 from public.user_roles ur where ur.user_id = st.user_id and ur.role::text = o.role_type))
      )
      order by case o.scope when 'department' then 1 when 'outlet' then 2 else 3 end
      limit 1
    ), st.type_cf) as eff_cf
    from staff_types st
  ),
  computed as (
    select e.staff_id, e.leave_type_id, e.max_balance,
      greatest(0, coalesce(po.opening, 0)
        + case when e.accrual = 'none' then 0 else coalesce(e.default_quota, 0) end
        - coalesce(u.used_days, 0)) as raw_carry
    from eff e
    left join prev_open po on po.staff_id = e.staff_id and po.leave_type_id = e.leave_type_id
    left join used u       on u.staff_id  = e.staff_id  and u.leave_type_id  = e.leave_type_id
    where e.eff_cf = true
  )
  insert into public.leave_balances (staff_id, leave_type_id, year, opening)
  select staff_id, leave_type_id, _target_fy,
    case when max_balance is not null then least(raw_carry, max_balance) else raw_carry end
  from computed
  where raw_carry > 0;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'target_fy', _target_fy, 'openings_written', v_rows);
end;
$$;
revoke all on function public.run_leave_rollover(int) from public, anon;
grant execute on function public.run_leave_rollover(int) to authenticated;
