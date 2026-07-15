-- ============================================================================
-- Expand the permission catalog to a full View/Add/Edit/Delete matrix (RBAC).
-- Additive + safe: it only makes new permissions ASSIGNABLE in Rights Templates.
-- Enforcement (gating actions on these keys in the client + server RLS) is wired
-- separately (see docs/RBAC_PLAN.md), so this migration changes NO behaviour.
-- ============================================================================

-- 1. New permission keys (owner short-circuits, so owners get them automatically).
INSERT INTO public.permissions (key, module, label, sort_order) VALUES
  ('staff.delete',        'People',               'Delete staff', 12),
  ('attendance.create',   'Attendance',           'Mark attendance', 24),
  ('attendance.edit',     'Attendance',           'Edit attendance', 25),
  ('attendance.delete',   'Attendance',           'Delete attendance', 26),
  ('leave.edit',          'Leave',                'Edit leave', 33),
  ('leave.delete',        'Leave',                'Delete leave', 34),
  ('advances.view',       'Advances & Requests',  'View advance requests', 45),
  ('advances.create',     'Advances & Requests',  'Raise advance request', 46),
  ('advances.edit',       'Advances & Requests',  'Edit advance request', 47),
  ('advances.delete',     'Advances & Requests',  'Delete advance request', 48),
  ('pettycash.view',      'Finance',              'View petty cash', 64),
  ('expenses.edit',       'Finance',              'Edit expenses', 65),
  ('expenses.delete',     'Finance',              'Delete expenses', 66)
ON CONFLICT (key) DO NOTHING;

-- 2. Append the new keys to the built-in templates (APPEND-ONLY via DISTINCT
--    union, so any owner customisation of a template is preserved). Each role's
--    additions mirror src/lib/permissions.ts ROLE_PERMISSIONS. The Owner template
--    is is_owner -> already ALL, so it needs no update.
UPDATE public.rights_templates
SET permissions = ARRAY(SELECT DISTINCT unnest(
  permissions || ARRAY[
    'staff.delete',
    'attendance.create','attendance.edit','attendance.delete',
    'leave.edit','leave.delete',
    'advances.view','advances.create','advances.edit','advances.delete',
    'pettycash.view','expenses.edit','expenses.delete'
  ]::text[]))
WHERE role_key = 'admin' AND is_builtin;

UPDATE public.rights_templates
SET permissions = ARRAY(SELECT DISTINCT unnest(
  permissions || ARRAY['advances.view','advances.create','pettycash.view']::text[]))
WHERE role_key = 'accountant' AND is_builtin;

UPDATE public.rights_templates
SET permissions = ARRAY(SELECT DISTINCT unnest(
  permissions || ARRAY['advances.view','advances.create']::text[]))
WHERE role_key = 'staff' AND is_builtin;
