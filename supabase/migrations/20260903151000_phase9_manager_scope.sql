-- ============================================================================
-- PHASE 9 (part 2/2): the outlet-scoped Manager role.
--
-- Client's words: HR is company-wide; a manager belongs to ONE outlet — they
-- watch who is absent there, can mark a hardworking person present even when
-- they took leave (Bulk Attendance Adjustments, already audited by
-- log_bulk_attendance_adjustment), and receive that outlet's leave requests.
-- A manager must only ever see the staff of the outlet they manage, and must
-- NEVER see pay: no salaries.view, no payslips.download, no settlements.*.
--
-- Everything here is ADDITIVE: no existing owner/admin/hr/self policy is
-- weakened or rewritten. The proven is_leave_of_my_report() hierarchy flow is
-- kept; the outlet predicate layers visibility on top.
--
-- NOTE (row vs column): like admins/accountants today, a staff SELECT returns
-- the whole row; salary confidentiality is enforced by the client's
-- salaries.view gate (the manager template never holds it) — same model as
-- every other non-owner management role in this app.
-- ============================================================================

-- ---- 1. helper --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_outlet_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT outlet_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_outlet_id() TO authenticated;

-- ---- 2. built-in Manager template ------------------------------------------
INSERT INTO public.rights_templates (name, description, permissions, is_owner, is_builtin, role_key)
VALUES
  ('Manager', 'Outlet-scoped: attendance and leave for one outlet. No pay visibility of any kind.',
    ARRAY['dashboard.view',
          'staff.view',
          'attendance.view','attendance.create','attendance.edit','attendance.manage',
          'leave.view','leave.approve']::text[], false, true, 'manager')
ON CONFLICT (name) DO NOTHING;

-- ---- 3. additive outlet-scoped RLS for the manager role ---------------------
-- staff: read the outlet's staff only.
DROP POLICY IF EXISTS "Managers view outlet staff" ON public.staff;
CREATE POLICY "Managers view outlet staff"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND outlet_id IS NOT NULL
    AND outlet_id = public.current_user_outlet_id()
  );

-- attendance_sessions: manage the outlet's attendance (join through staff).
DROP POLICY IF EXISTS "Managers manage outlet attendance" ON public.attendance_sessions;
CREATE POLICY "Managers manage outlet attendance"
  ON public.attendance_sessions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = attendance_sessions.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = attendance_sessions.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  );

-- attendance_breaks: join through the session -> staff.
DROP POLICY IF EXISTS "Managers manage outlet attendance breaks" ON public.attendance_breaks;
CREATE POLICY "Managers manage outlet attendance breaks"
  ON public.attendance_breaks FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions a
      JOIN public.staff s ON s.id = a.staff_id
      WHERE a.id = attendance_breaks.session_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  )
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- attendance_discipline_log: bulk attendance overrides can touch fines.
DROP POLICY IF EXISTS "Managers manage outlet discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Managers manage outlet discipline log"
  ON public.attendance_discipline_log FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = attendance_discipline_log.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  )
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- leave_records: the outlet's requests are visible and approvable. The
-- hierarchy policies (is_leave_of_my_report) stay untouched alongside.
DROP POLICY IF EXISTS "Managers view outlet leave" ON public.leave_records;
CREATE POLICY "Managers view outlet leave"
  ON public.leave_records FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = leave_records.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  );

DROP POLICY IF EXISTS "Managers approve outlet leave" ON public.leave_records;
CREATE POLICY "Managers approve outlet leave"
  ON public.leave_records FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = leave_records.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  )
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- staff_roster: bulk attendance writes WO/FD/HD/LV/A cells here.
DROP POLICY IF EXISTS "Managers manage outlet roster" ON public.staff_roster;
CREATE POLICY "Managers manage outlet roster"
  ON public.staff_roster FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_roster.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  )
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- leave_balances: read the outlet's balances.
DROP POLICY IF EXISTS "Managers view outlet leave balances" ON public.leave_balances;
CREATE POLICY "Managers view outlet leave balances"
  ON public.leave_balances FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = leave_balances.staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    )
  );
