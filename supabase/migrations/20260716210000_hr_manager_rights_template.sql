-- ============================================================================
-- "HR Manager" rights template — full HR operations (staff, attendance, leave,
-- roster, holidays, approvals, reports) but NOT finance/payroll or settings.
-- Assignable to a user alongside the built-in Owner/Administrator/Accountant/
-- Staff/Chartered Accountant templates. Idempotent by name.
-- ============================================================================

INSERT INTO public.rights_templates (name, description, permissions, is_owner, is_builtin, role_key)
SELECT
  'HR Manager',
  'Full HR operations: staff, attendance, leave, roster, holidays, approvals and reports. No finance, payroll or settings.',
  ARRAY[
    'dashboard.view',
    'staff.view', 'staff.create', 'staff.edit',
    'attendance.view', 'attendance.create', 'attendance.edit', 'attendance.manage',
    'leave.view', 'leave.record', 'leave.edit', 'leave.approve',
    'roster.manage', 'holidays.manage',
    'approvals.approve',
    'reports.view',
    'users.view'
  ]::text[],
  false, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.rights_templates WHERE name = 'HR Manager');
