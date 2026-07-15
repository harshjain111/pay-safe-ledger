// ============================================================================
// Permission catalog + pure resolution (no IO; mirrors the SQL has_permission).
//
// Permissions are grouped by module for the rights-template editor. Most data
// modules expose the standard View / Add / Edit / Delete set; some carry extra
// "special" actions (approve, run settlements, manage). Built-in templates map
// each legacy role to a sensible default set so existing users keep working
// (no lockout); owners are ALL (handled separately), and any permission can also
// be granted/revoked per-user on top of the template.
//
// NOTE: expanding this catalog is additive — it makes new permissions ASSIGNABLE
// in the Rights Templates screen. ENFORCEMENT (gating actions on the new keys, in
// the client and in server RLS) is wired separately; see docs/RBAC_PLAN.md.
// ============================================================================

export interface PermissionDef {
  key: string;
  label: string;
}
export interface PermissionModule {
  module: string;
  permissions: PermissionDef[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    module: 'Dashboard',
    permissions: [{ key: 'dashboard.view', label: 'View dashboard' }],
  },
  {
    module: 'People',
    permissions: [
      { key: 'staff.view', label: 'View staff' },
      { key: 'staff.create', label: 'Add staff' },
      { key: 'staff.edit', label: 'Edit staff' },
      { key: 'staff.delete', label: 'Delete staff' },
      { key: 'users.view', label: 'View users' },
      { key: 'users.manage', label: 'Manage users & rights' },
    ],
  },
  {
    module: 'Attendance',
    permissions: [
      { key: 'attendance.view', label: 'View attendance' },
      { key: 'attendance.create', label: 'Mark attendance' },
      { key: 'attendance.edit', label: 'Edit attendance' },
      { key: 'attendance.delete', label: 'Delete attendance' },
      { key: 'attendance.manage', label: 'Bulk attendance & corrections' },
      { key: 'roster.manage', label: 'Manage duty roster' },
      { key: 'holidays.manage', label: 'Manage holidays' },
    ],
  },
  {
    module: 'Leave',
    permissions: [
      { key: 'leave.view', label: 'View leave' },
      { key: 'leave.record', label: 'Record leave' },
      { key: 'leave.edit', label: 'Edit leave' },
      { key: 'leave.delete', label: 'Delete leave' },
      { key: 'leave.approve', label: 'Approve leave' },
    ],
  },
  {
    module: 'Advances & Requests',
    permissions: [
      { key: 'advances.view', label: 'View advance requests' },
      { key: 'advances.create', label: 'Raise advance request' },
      { key: 'advances.edit', label: 'Edit advance request' },
      { key: 'advances.delete', label: 'Delete advance request' },
    ],
  },
  {
    module: 'Approvals',
    permissions: [{ key: 'approvals.approve', label: 'Approve advances & expenses' }],
  },
  {
    module: 'Payroll',
    permissions: [
      { key: 'salaries.view', label: 'View salaries (confidential)' },
      { key: 'settlements.run', label: 'Run salary settlements' },
      { key: 'payouts.execute', label: 'Execute payouts' },
    ],
  },
  {
    module: 'Finance',
    permissions: [
      { key: 'ledger.view', label: 'View ledger' },
      { key: 'pettycash.view', label: 'View petty cash' },
      { key: 'pettycash.manage', label: 'Manage petty cash' },
      { key: 'expenses.view', label: 'View expenses' },
      { key: 'expenses.create', label: 'Create expenses' },
      { key: 'expenses.edit', label: 'Edit expenses' },
      { key: 'expenses.delete', label: 'Delete expenses' },
    ],
  },
  {
    module: 'Reports',
    permissions: [
      { key: 'reports.view', label: 'View reports' },
      { key: 'audit.view', label: 'View audit log' },
    ],
  },
  {
    module: 'Settings',
    permissions: [
      { key: 'settings.payroll.edit', label: 'Edit payroll & statutory settings' },
      { key: 'settings.attendance.edit', label: 'Edit attendance & leave settings' },
      { key: 'settings.organisation.edit', label: 'Edit organisation settings' },
      { key: 'settings.data.manage', label: 'Data management (backup / clear)' },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key));

const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => [p.key, p.label] as const)),
);
export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key] ?? key;
}

/**
 * Built-in role -> permission set. Each role's set is a SUPERSET of its current
 * capabilities so nothing regresses, extended with the natural View/Add/Edit/
 * Delete for the modules that role manages (these become meaningful once
 * enforcement is switched to permission-based — see docs/RBAC_PLAN.md). Owner is
 * ALL (handled separately). Owner-only confidentials (salaries.view,
 * settings.payroll.edit, settings.data.manage) are never granted to a role here.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [...ALL_PERMISSIONS],
  admin: [
    'dashboard.view',
    'staff.view', 'staff.create', 'staff.edit', 'staff.delete',
    'users.view', 'users.manage',
    'attendance.view', 'attendance.create', 'attendance.edit', 'attendance.delete', 'attendance.manage',
    'roster.manage', 'holidays.manage',
    'leave.view', 'leave.record', 'leave.edit', 'leave.delete', 'leave.approve',
    'advances.view', 'advances.create', 'advances.edit', 'advances.delete',
    'approvals.approve',
    'payouts.execute',
    'ledger.view', 'pettycash.view', 'pettycash.manage',
    'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete',
    'reports.view', 'audit.view',
    'settings.attendance.edit',
  ],
  accountant: [
    'dashboard.view',
    'staff.view',
    'attendance.view',
    'leave.view', 'leave.record',
    'advances.view', 'advances.create',
    'payouts.execute',
    'ledger.view', 'pettycash.view', 'expenses.view', 'expenses.create',
    'reports.view',
  ],
  staff: [
    'dashboard.view',
    'attendance.view',
    'leave.view', 'leave.record',
    'advances.view', 'advances.create',
    'expenses.view', 'expenses.create',
  ],
  ca: [
    'dashboard.view',
    'attendance.view',
    'leave.view',
    'ledger.view',
    'reports.view', 'audit.view',
  ],
};

export interface ResolveInput {
  /** Owner template / owner role -> all permissions. */
  isOwner: boolean;
  templatePermissions: string[];
  granted?: string[];
  revoked?: string[];
}

/** Effective permission set = owner? ALL : (template ∪ granted) − revoked. */
export function resolveEffectivePermissions(input: ResolveInput): Set<string> {
  if (input.isOwner) return new Set(ALL_PERMISSIONS);
  const set = new Set<string>([...input.templatePermissions, ...(input.granted ?? [])]);
  for (const r of input.revoked ?? []) set.delete(r);
  return set;
}

export function can(perms: Set<string> | null | undefined, key: string): boolean {
  return !!perms && perms.has(key);
}
