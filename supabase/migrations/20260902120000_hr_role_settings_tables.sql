-- ============================================================================
-- HR ROLE (follow-up): settings tables the HR operator manages.
--
-- The first HR pass covered the people-ops data tables; the attendance/leave
-- SETTINGS cards (discipline rules, biometric devices, HR pay rules, outlets &
-- geofences) still had owner/admin-only policies, so an HR user could see the
-- cards but every save would be rejected by RLS. Same manage-parity policy
-- shape as the admin ones on those tables.
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'discipline_rules',
    'biometric_devices',
    'hr_pay_rules',
    'outlets'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "HR can manage %s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "HR can manage %s" ON public.%I FOR ALL TO authenticated
           USING (public.has_role(auth.uid(), ''hr''::app_role))
           WITH CHECK (public.has_role(auth.uid(), ''hr''::app_role))', t, t);
    END IF;
  END LOOP;
END $$;
