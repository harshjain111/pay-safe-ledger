-- ============================================================================
-- PHASE 9 (fix): close the three routes around the manager's outlet scope.
--
-- Found by a live RLS test: my additive outlet policies were correct, but RLS
-- policies are OR'ed, so three PRE-EXISTING permissive policies still handed a
-- manager the whole company:
--
--   attendance_sessions "Attendance managers manage sessions"
--       USING has_permission(uid,'attendance.manage')   -- no outlet predicate,
--       and the Manager template must hold attendance.manage to do Bulk
--       Attendance Adjustments at all. Measured leak: all 42,516 sessions.
--   leave_balances "Read leave_balances"   USING (true)
--   staff_roster   "Read staff_roster"     USING (true)
--
-- manager_outlet_ok() returns TRUE for every non-manager, so each rewritten
-- policy is byte-equivalent for owners, admins, HR, accountants, CA and staff;
-- only the manager role gains the outlet requirement. The two USING(true)
-- policies stay wide open for everyone else exactly as before — tightening
-- them generally is a separate decision, not this migration's business.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manager_outlet_ok(_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Not an outlet-scoped manager -> unchanged behaviour.
    NOT public.has_role(auth.uid(), 'manager'::app_role)
    -- Manager -> the row's staff must belong to their outlet.
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = _staff_id
        AND s.outlet_id IS NOT NULL
        AND s.outlet_id = public.current_user_outlet_id()
    );
$$;

GRANT EXECUTE ON FUNCTION public.manager_outlet_ok(uuid) TO authenticated, service_role;

-- ---- attendance_sessions ----------------------------------------------------
DROP POLICY IF EXISTS "Attendance managers manage sessions" ON public.attendance_sessions;
CREATE POLICY "Attendance managers manage sessions"
  ON public.attendance_sessions FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'attendance.manage')
              AND public.manager_outlet_ok(staff_id))
  WITH CHECK (public.has_permission(auth.uid(), 'attendance.manage')
              AND public.manager_outlet_ok(staff_id));

-- ---- leave_balances ---------------------------------------------------------
DROP POLICY IF EXISTS "Read leave_balances" ON public.leave_balances;
CREATE POLICY "Read leave_balances"
  ON public.leave_balances FOR SELECT TO authenticated
  USING (public.manager_outlet_ok(staff_id));

-- ---- staff_roster -----------------------------------------------------------
DROP POLICY IF EXISTS "Read staff_roster" ON public.staff_roster;
CREATE POLICY "Read staff_roster"
  ON public.staff_roster FOR SELECT TO authenticated
  USING (public.manager_outlet_ok(staff_id));
