-- ============================================================================
-- Managers can view + approve/reject the leave of their DIRECT REPORTS.
--
-- A "manager" is a staff row with is_manager = true; a report is a staff row
-- whose reporting_manager_id points at that manager. Managers may act only on
-- reports who are NOT themselves managers — a manager's own leave escalates to
-- admin/owner (owner "rules" managers). Owners (FOR ALL) and admins/accountants
-- (Administrator template runs as role=accountant) already have broad policies.
-- ============================================================================

-- Is auth.uid() the reporting manager of the staff who owns this leave row,
-- and is that report a non-manager? (SECURITY DEFINER to read staff cleanly.)
create or replace function public.is_leave_of_my_report(_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff rep
    join public.staff mgr on mgr.id = rep.reporting_manager_id
    where rep.id = _staff_id
      and mgr.user_id = auth.uid()
      and coalesce(rep.is_manager, false) = false
  );
$$;

grant execute on function public.is_leave_of_my_report(uuid) to authenticated;

drop policy if exists "Managers view reports leave"    on public.leave_records;
drop policy if exists "Managers approve reports leave"  on public.leave_records;

create policy "Managers view reports leave"
on public.leave_records
for select
using (public.is_leave_of_my_report(staff_id));

create policy "Managers approve reports leave"
on public.leave_records
for update
using (is_immutable = false and public.is_leave_of_my_report(staff_id))
with check (public.is_leave_of_my_report(staff_id));
