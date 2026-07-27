-- ============================================================================
-- Bulk salary update (owner-only), applied atomically.
--
-- For each staff whose salary ACTUALLY changes: update staff.monthly_salary,
-- close the open salary_history interval (effective_to = today) and open a new
-- one (effective_from = today) so payroll's get_staff_salary_for_month() picks
-- up the new figure. Each change is classified as an increment (raise) or a
-- decrement (reduction). Returns a summary the caller uses to notify owners.
--
-- Mirrors the single-staff path in StaffForm.tsx, but batched + server-enforced
-- (SECURITY DEFINER bypasses RLS; owner is checked explicitly via has_role).
-- ============================================================================

create or replace function public.bulk_update_salaries(_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller  uuid    := auth.uid();
  v_today   date    := current_date;
  v_item    jsonb;
  v_staff   uuid;
  v_new     numeric;
  v_old     numeric;
  v_reason  text;
  v_name    text;
  v_updated int     := 0;
  v_incr    int     := 0;
  v_decr    int     := 0;
  v_net     numeric := 0;
  v_changes jsonb   := '[]'::jsonb;
begin
  -- Salary is confidential and owner-controlled (matches canSetSalary = isOwner).
  if not public.has_role(v_caller, 'owner'::app_role) then
    raise exception 'Only an owner can change salaries';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(_changes, '[]'::jsonb)) loop
    v_staff  := (v_item->>'staff_id')::uuid;
    v_new    := round((v_item->>'monthly_salary')::numeric, 2);
    v_reason := nullif(btrim(coalesce(v_item->>'reason', '')), '');
    if v_staff is null or v_new is null or v_new < 0 then continue; end if;

    select monthly_salary, full_name into v_old, v_name from public.staff where id = v_staff;
    if not found then continue; end if;
    v_old := coalesce(v_old, 0);
    if v_new = v_old then continue; end if;   -- no-op, skip

    update public.staff set monthly_salary = v_new where id = v_staff;

    update public.salary_history set effective_to = v_today
      where staff_id = v_staff and effective_to is null;

    insert into public.salary_history (staff_id, monthly_salary, effective_from, changed_by, change_reason)
      values (v_staff, v_new, v_today, v_caller,
              coalesce(v_reason, case when v_new > v_old then 'Bulk increment' else 'Bulk reduction' end));

    v_updated := v_updated + 1;
    v_net     := v_net + (v_new - v_old);
    if v_new > v_old then v_incr := v_incr + 1; else v_decr := v_decr + 1; end if;
    v_changes := v_changes || jsonb_build_object(
      'staff_id', v_staff, 'name', v_name, 'old', v_old, 'new', v_new,
      'delta', v_new - v_old,
      'type', case when v_new > v_old then 'increment' else 'decrement' end
    );
  end loop;

  return jsonb_build_object(
    'updated',    v_updated,
    'increments', v_incr,
    'decrements', v_decr,
    'net_delta',  v_net,
    'changes',    v_changes
  );
end;
$$;

revoke all on function public.bulk_update_salaries(jsonb) from public, anon;
grant execute on function public.bulk_update_salaries(jsonb) to authenticated;
