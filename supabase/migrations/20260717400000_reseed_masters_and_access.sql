-- ============================================================================
-- Re-seed the Departments & Designations master lists, and broaden who can
-- manage the org lookup masters.
--
-- The original seed migrations ran `SELECT DISTINCT ... FROM staff` when staff
-- was still EMPTY on the fresh project (staff were imported afterwards via the
-- connector), so departments/designations ended up empty and staff.*_id unset —
-- which is why the dropdowns in the staff form show nothing. Re-seed from the
-- current staff rows (idempotent) and link them.
-- ============================================================================

-- Departments -----------------------------------------------------------------
insert into public.departments (name)
select distinct btrim(department)
from public.staff
where department is not null and btrim(department) <> ''
on conflict (name) do nothing;

update public.staff s
set department_id = d.id
from public.departments d
where s.department_id is null
  and s.department is not null
  and btrim(s.department) = d.name;

-- Designations ----------------------------------------------------------------
insert into public.designations (name)
select distinct btrim(designation)
from public.staff
where designation is not null and btrim(designation) <> ''
on conflict (name) do nothing;

update public.staff s
set designation_id = d.id
from public.designations d
where s.designation_id is null
  and s.designation is not null
  and btrim(s.designation) = d.name;

-- Broaden management of the lookup masters to accountants too (was owner/admin
-- only) so admin + accountant + HR can maintain outlets/departments/designations.
drop policy if exists "Owners and admins manage outlets" on public.outlets;
create policy "Managers manage outlets" on public.outlets for all to authenticated
  using      (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'));

drop policy if exists "Owners and admins manage departments" on public.departments;
create policy "Managers manage departments" on public.departments for all to authenticated
  using      (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'));

drop policy if exists "Owners and admins manage designations" on public.designations;
create policy "Managers manage designations" on public.designations for all to authenticated
  using      (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'accountant'));
