-- ============================================================================
-- Consolidate the two leave-balance tables into one source of truth.
--
-- The schema carried two parallel models for "how many leave days does X have":
--
--   employee_leave_balance  (staff_id, leave_type_id, balance)   -- 428 rows
--       Written by the Leave Assign and Leave Balance screens. THE LIVE ONE.
--   leave_balances          (staff_id, leave_type_id, year, opening) -- 0 rows
--       Read by computeLeaveBalancesForStaff() (employee dashboard, Leave
--       Records, the leave dialog) and written by run_leave_rollover().
--
-- Consequences of the split, all fixed here:
--   * HR adjusting a balance on the Leave Balance screen changed nothing
--     anywhere else, because every display path read the other table.
--   * employee_leave_balance had NO policy for HR, so HR — who owns these two
--     screens — got an RLS failure on every save.
--   * The Phase 9 manager outlet predicate was added to leave_balances, i.e.
--     to the empty table, so it scoped nothing.
--
-- After this migration employee_leave_balance is the only balance table. Its
-- `balance` column carries the opening / carry-forward, and the displayed
-- balance stays opening + accrued - used, computed as before.
-- ============================================================================

-- ---- 1. RLS the live table actually needs ----------------------------------
DROP POLICY IF EXISTS "HR can manage employee leave balances" ON public.employee_leave_balance;
CREATE POLICY "HR can manage employee leave balances"
  ON public.employee_leave_balance FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers view outlet employee leave balances" ON public.employee_leave_balance;
CREATE POLICY "Managers view outlet employee leave balances"
  ON public.employee_leave_balance FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = employee_leave_balance.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  );

-- ---- 2. rollover writes the surviving table --------------------------------
-- Same maths as before (prior-year opening + accrual - used, capped at
-- max_balance, only for types whose carry-forward is on). The target-year
-- column is gone with leave_balances, so the recomputed carry-forward simply
-- becomes the employee's new opening balance.
CREATE OR REPLACE FUNCTION public.run_leave_rollover(_target_fy integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_start_month int;
  v_prev_from date; v_prev_to date;
  v_rows int := 0;
begin
  select coalesce(leave_year_start_month, 1) into v_start_month from public.organization_profile limit 1;
  v_start_month := coalesce(v_start_month, 1);
  v_prev_from := make_date(_target_fy - 1, v_start_month, 1);
  v_prev_to   := make_date(_target_fy,     v_start_month, 1) - 1;

  with used as (
    select r.staff_id, r.leave_type_id, count(*)::numeric as used_days
    from public.leave_records r
    where r.status = 'approved' and r.leave_date between v_prev_from and v_prev_to
      and r.leave_type_id is not null
    group by r.staff_id, r.leave_type_id
  ),
  prev_open as (
    select staff_id, leave_type_id, coalesce(balance, 0) as opening
    from public.employee_leave_balance
  ),
  staff_types as (
    select s.id as staff_id, s.department_id, s.outlet_id, s.user_id,
           t.id as leave_type_id, t.max_balance, t.default_quota, t.accrual,
           t.carry_forward as type_cf
    from public.staff s cross join public.leave_types t
    where s.is_active = true and t.is_active = true
  ),
  eff as (
    select st.*, coalesce((
      select o.carry_forward_override
      from public.leave_type_overrides o
      where o.leave_type_id = st.leave_type_id and o.is_active
        and o.carry_forward_override is not null and (
          (o.scope = 'department' and o.department_id = st.department_id) or
          (o.scope = 'outlet'     and o.outlet_id     = st.outlet_id) or
          (o.scope = 'role'       and exists (select 1 from public.user_roles ur
                                               where ur.user_id = st.user_id
                                                 and ur.role::text = o.role_type))
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
  ),
  final as (
    select staff_id, leave_type_id,
           case when max_balance is not null then least(raw_carry, max_balance) else raw_carry end as new_balance
    from computed
  ),
  updated as (
    update public.employee_leave_balance b
       set balance = f.new_balance, updated_at = now()
      from final f
     where b.staff_id = f.staff_id and b.leave_type_id = f.leave_type_id
     returning 1
  )
  select count(*) into v_rows from updated;

  return jsonb_build_object('ok', true, 'target_fy', _target_fy, 'balances_updated', v_rows);
end;
$$;

-- ---- 3. retire the unused table --------------------------------------------
-- 0 rows; every reader now points at employee_leave_balance.
DROP TABLE IF EXISTS public.leave_balances CASCADE;
