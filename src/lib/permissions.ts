// ============================================================================
// Permission catalog + pure resolution (no IO; mirrors the SQL has_permission).
//
// Permissions are grouped by module for the rights-template editor. Built-in
// templates map 1:1 to the legacy roles so existing users keep their rights
// (no lockout). The Owner template is special-cased to ALL permissions.
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
      { key: 'users.view', label: 'View users' },
      { key: 'users.manage', label: 'Manage users & rights' },
    ],
  },
  {
    module: 'Attendance',
    permissions: [
      { key: 'attendance.view', label: 'View attendance' },
      { key: 'attendance.manage', label: 'Manage attendance' },
      { key: 'roster.manage', label: 'Manage duty roster' },
      { key: 'holidays.manage', label: 'Manage holidays' },
    ],
  },
  {
    module: 'Leave',
    permissions: [
      { key: 'leave.view', label: 'View leave' },
      { key: 'leave.record', label: 'Record leave' },
      { key: 'leave.approve', label: 'Approve leave' },
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
      { key: 'pettycash.manage', label: 'Manage petty cash' },
      { key: 'expenses.view', label: 'View expenses' },
      { key: 'expenses.create', label: 'Create expenses' },
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
 * Built-in role -> permission set, mirroring each legacy role's current
 * capabilities. Owner is ALL (handled separately). These seed the built-in
 * templates and back the no-lockout fallback for un-assigned users.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [...ALL_PERMISSIONS],
  admin: [
    'dashboard.view',
    'staff.view', 'staff.create', 'staff.edit',
    'users.view', 'users.manage',
    'attendance.view', 'attendance.manage', 'roster.manage', 'holidays.manage',
    'leave.view', 'leave.record', 'leave.approve',
    'approvals.approve',
    'payouts.execute',
    'ledger.view', 'pettycash.manage', 'expenses.view', 'expenses.create',
    'reports.view', 'audit.view',
    'settings.attendance.edit',
  ],
  accountant: [
    'dashboard.view',
    'staff.view',
    'attendance.view',
    'leave.view', 'leave.record',
    'payouts.execute',
    'ledger.view', 'expenses.view', 'expenses.create',
    'reports.view',
  ],
  staff: [
    'dashboard.view',
    'attendance.view',
    'leave.view', 'leave.record',
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
