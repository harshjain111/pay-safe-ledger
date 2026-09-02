-- ============================================================================
-- PHASE 0 (Attendo rebuild): weekly-off must be settable by the people who fix
-- attendance data.
--
-- week_off / shift_assignment (the weekly template tables) were owner/admin
-- manage-only. The Week Off page is the tool Phase 0 points users at to fix the
-- "every day is a paid off-day" bug, and HR is the role that does that work.
-- Same manage-parity shape as the other HR people-ops policies.
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['week_off', 'shift_assignment'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "HR can manage %s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "HR can manage %s" ON public.%I FOR ALL TO authenticated
           USING (public.has_role(auth.uid(), ''hr''::app_role))
           WITH CHECK (public.has_role(auth.uid(), ''hr''::app_role))', t, t);
    END IF;
  END LOOP;
END $$;
