-- ---------------------------------------------------------------------------
-- A transitional default for organization_id.
--
-- The previous migration made organization_id NOT NULL on thirteen tables.
-- Nothing in the app supplies it yet -- there is no organisation context in
-- the client until the switcher is built -- so every create flow would fail:
-- adding a staff member, an outlet, a designation, a shift.
--
-- Defaulting to the one existing organisation keeps those flows working while
-- the app is still single-org. It is not a long-term answer: once the client
-- sends an explicit organization_id the default is simply never reached, and
-- it should be dropped when the org switcher lands so that a missing value
-- fails loudly instead of silently landing rows in the first organisation.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outlets','staff','departments','designations','leave_types','shifts','rights_templates',
    'payroll_statutory_settings','hr_pay_rules','leave_settings','biometric_devices',
    'user_roles','user_permissions'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.default_organization_id()', t);
  END LOOP;
END $$;
