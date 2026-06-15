-- ============================================================================
-- PERMISSIONS SYSTEM + RIGHTS TEMPLATES
--
--   permissions       -> catalog of permission keys (grouped by module)
--   rights_templates  -> named permission sets (Owner is a built-in = ALL)
--   user_permissions  -> per-user template + grant/revoke overrides
--
-- has_permission(uid, key) is the server-side primitive. It is designed so NO
-- ONE is ever locked out:
--   * owners always return true,
--   * a user with no explicit assignment falls back to the built-in template
--     for their legacy role (owner/admin/accountant/staff/ca),
--   * an owner TEMPLATE short-circuits to all permissions.
--
-- This pass converts the two owner-only areas the product called out
-- (Payroll & Statutory settings, Data Management) to permission checks; the
-- rest of the RLS stays role-based (templates map 1:1 to roles) and migrates
-- incrementally.
-- ============================================================================

-- ---- 1. permission catalog --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  key        text PRIMARY KEY,
  module     text NOT NULL,
  label      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view permissions" ON public.permissions;
CREATE POLICY "Authenticated view permissions"
  ON public.permissions FOR SELECT TO authenticated USING (true);

INSERT INTO public.permissions (key, module, label, sort_order) VALUES
  ('dashboard.view',            'Dashboard',  'View dashboard', 1),
  ('staff.view',                'People',     'View staff', 10),
  ('staff.create',              'People',     'Add staff', 11),
  ('staff.edit',                'People',     'Edit staff', 12),
  ('users.view',                'People',     'View users', 13),
  ('users.manage',              'People',     'Manage users & rights', 14),
  ('attendance.view',           'Attendance', 'View attendance', 20),
  ('attendance.manage',         'Attendance', 'Manage attendance', 21),
  ('roster.manage',             'Attendance', 'Manage duty roster', 22),
  ('holidays.manage',           'Attendance', 'Manage holidays', 23),
  ('leave.view',                'Leave',      'View leave', 30),
  ('leave.record',              'Leave',      'Record leave', 31),
  ('leave.approve',             'Leave',      'Approve leave', 32),
  ('approvals.approve',         'Approvals',  'Approve advances & expenses', 40),
  ('salaries.view',             'Payroll',    'View salaries (confidential)', 50),
  ('settlements.run',           'Payroll',    'Run salary settlements', 51),
  ('payouts.execute',           'Payroll',    'Execute payouts', 52),
  ('ledger.view',               'Finance',    'View ledger', 60),
  ('pettycash.manage',          'Finance',    'Manage petty cash', 61),
  ('expenses.view',             'Finance',    'View expenses', 62),
  ('expenses.create',           'Finance',    'Create expenses', 63),
  ('reports.view',              'Reports',    'View reports', 70),
  ('audit.view',                'Reports',    'View audit log', 71),
  ('settings.payroll.edit',     'Settings',   'Edit payroll & statutory settings', 80),
  ('settings.attendance.edit',  'Settings',   'Edit attendance & leave settings', 81),
  ('settings.organisation.edit','Settings',   'Edit organisation settings', 82),
  ('settings.data.manage',      'Settings',   'Data management (backup / clear)', 83)
ON CONFLICT (key) DO NOTHING;

-- ---- 2. rights templates ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rights_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}',
  is_owner    boolean NOT NULL DEFAULT false, -- owner template = ALL permissions
  is_builtin  boolean NOT NULL DEFAULT false,
  role_key    text,                           -- links a built-in to a legacy role
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rights_templates_name_unique UNIQUE (name)
);

ALTER TABLE public.rights_templates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER rights_templates_set_updated_at
  BEFORE UPDATE ON public.rights_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- 3. per-user assignment + overrides ------------------------------------
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.rights_templates(id) ON DELETE SET NULL,
  granted     text[] NOT NULL DEFAULT '{}',
  revoked     text[] NOT NULL DEFAULT '{}',
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER user_permissions_set_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- 4. the server-side primitive ------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  up   public.user_permissions;
  tmpl public.rights_templates;
  eff  text[];
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  -- Owners always have every permission (no lockout).
  IF public.has_role(_user_id, 'owner'::app_role) THEN RETURN true; END IF;

  SELECT * INTO up FROM public.user_permissions WHERE user_id = _user_id;

  IF up.user_id IS NULL THEN
    -- No explicit assignment: fall back to the built-in template for the user's
    -- legacy role so existing users are never locked out.
    SELECT t.* INTO tmpl
    FROM public.rights_templates t
    JOIN public.user_roles ur ON ur.user_id = _user_id AND ur.role::text = t.role_key
    LIMIT 1;
  ELSE
    SELECT * INTO tmpl FROM public.rights_templates WHERE id = up.template_id;
  END IF;

  IF tmpl.id IS NOT NULL AND tmpl.is_owner THEN RETURN true; END IF;

  eff := COALESCE(tmpl.permissions, '{}');
  IF up.granted IS NOT NULL THEN eff := eff || up.granted; END IF;
  IF up.revoked IS NOT NULL AND array_length(up.revoked, 1) IS NOT NULL THEN
    eff := ARRAY(SELECT unnest(eff) EXCEPT SELECT unnest(up.revoked));
  END IF;

  RETURN _perm = ANY(eff);
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- Effective permission set for the calling user (used by the client).
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  uuid := auth.uid();
  up   public.user_permissions;
  tmpl public.rights_templates;
  eff  text[];
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  IF public.has_role(uid, 'owner'::app_role) THEN
    RETURN QUERY SELECT key FROM public.permissions; RETURN;
  END IF;

  SELECT * INTO up FROM public.user_permissions WHERE user_id = uid;
  IF up.user_id IS NULL THEN
    SELECT t.* INTO tmpl
    FROM public.rights_templates t
    JOIN public.user_roles ur ON ur.user_id = uid AND ur.role::text = t.role_key
    LIMIT 1;
  ELSE
    SELECT * INTO tmpl FROM public.rights_templates WHERE id = up.template_id;
  END IF;

  IF tmpl.id IS NOT NULL AND tmpl.is_owner THEN
    RETURN QUERY SELECT key FROM public.permissions; RETURN;
  END IF;

  eff := COALESCE(tmpl.permissions, '{}');
  IF up.granted IS NOT NULL THEN eff := eff || up.granted; END IF;
  IF up.revoked IS NOT NULL AND array_length(up.revoked, 1) IS NOT NULL THEN
    eff := ARRAY(SELECT unnest(eff) EXCEPT SELECT unnest(up.revoked));
  END IF;

  RETURN QUERY SELECT DISTINCT unnest(eff);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- ---- 5. RLS for the new tables (now that has_permission exists) -------------
DROP POLICY IF EXISTS "Authenticated view rights templates" ON public.rights_templates;
DROP POLICY IF EXISTS "Manage rights templates"             ON public.rights_templates;
CREATE POLICY "Authenticated view rights templates"
  ON public.rights_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage rights templates"
  ON public.rights_templates FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS "View own or managed permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Manage user permissions"         ON public.user_permissions;
CREATE POLICY "View own or managed permissions"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'users.manage'));
CREATE POLICY "Manage user permissions"
  ON public.user_permissions FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'users.manage'));

-- ---- 6. seed built-in templates --------------------------------------------
INSERT INTO public.rights_templates (name, description, permissions, is_owner, is_builtin, role_key)
VALUES
  ('Owner', 'Full access to everything.', '{}', true, true, 'owner'),
  ('Administrator', 'Manage people, attendance, approvals, finance & reports (no salaries).',
    ARRAY['dashboard.view','staff.view','staff.create','staff.edit','users.view','users.manage',
          'attendance.view','attendance.manage','roster.manage','holidays.manage',
          'leave.view','leave.record','leave.approve','approvals.approve','payouts.execute',
          'ledger.view','pettycash.manage','expenses.view','expenses.create',
          'reports.view','audit.view','settings.attendance.edit']::text[], false, true, 'admin'),
  ('Accountant', 'Finance operations: payouts, ledger, expenses & reports.',
    ARRAY['dashboard.view','staff.view','attendance.view','leave.view','leave.record',
          'payouts.execute','ledger.view','expenses.view','expenses.create','reports.view']::text[], false, true, 'accountant'),
  ('Staff', 'Self-service: own attendance, leave & expenses.',
    ARRAY['dashboard.view','attendance.view','leave.view','leave.record','expenses.view','expenses.create']::text[], false, true, 'staff'),
  ('Chartered Accountant', 'Read-only: attendance, ledger, reports & audit.',
    ARRAY['dashboard.view','attendance.view','leave.view','ledger.view','reports.view','audit.view']::text[], false, true, 'ca')
ON CONFLICT (name) DO NOTHING;

-- ---- 7. backfill every existing user from their role (no lockout) ----------
INSERT INTO public.user_permissions (user_id, template_id)
SELECT ur.user_id, t.id
FROM public.user_roles ur
JOIN public.rights_templates t ON t.role_key = ur.role::text AND t.is_builtin
ON CONFLICT (user_id) DO NOTHING;

-- ---- 8. owner-only areas -> permission-based server enforcement -------------
-- Payroll & Statutory: replace the owner-only manage policy with a permission
-- check (owners still pass via has_permission's owner short-circuit).
DROP POLICY IF EXISTS "Owners manage statutory settings"     ON public.payroll_statutory_settings;
DROP POLICY IF EXISTS "Permission manage statutory settings" ON public.payroll_statutory_settings;
CREATE POLICY "Permission manage statutory settings"
  ON public.payroll_statutory_settings FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'settings.payroll.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.payroll.edit'));
