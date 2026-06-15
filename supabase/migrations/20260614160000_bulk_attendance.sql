-- ============================================================================
-- BULK ATTENDANCE ADJUSTMENTS
--
-- The bulk tool writes through the normal attendance pipeline (attendance_sessions
-- + staff_roster). Two things are needed server-side:
--   1. attendance managers (permission 'attendance.manage' — owners always, admins
--      via their template) may write any attendance session, and
--   2. each bulk edit is recorded as ONE audit_log entry (actor + scope) via a
--      SECURITY DEFINER function (clients can't insert into audit_log directly).
-- ============================================================================

-- 1. Permission-gated management of attendance sessions (owners pass via the
--    owner short-circuit in has_permission; additive — never removes access).
DROP POLICY IF EXISTS "Attendance managers manage sessions" ON public.attendance_sessions;
CREATE POLICY "Attendance managers manage sessions"
  ON public.attendance_sessions FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'attendance.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'attendance.manage'));

-- 2. Record a bulk attendance edit (actor + scope) in the audit log.
CREATE OR REPLACE FUNCTION public.log_bulk_attendance_adjustment(_action text, _scope jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec uuid := gen_random_uuid();
BEGIN
  IF NOT public.has_permission(auth.uid(), 'attendance.manage') THEN
    RAISE EXCEPTION 'You do not have permission to adjust attendance';
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, performed_by)
  VALUES ('attendance_bulk', rec, _action, _scope, auth.uid());

  RETURN rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_bulk_attendance_adjustment(text, jsonb) TO authenticated;
