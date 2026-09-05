// ============================================================================
// Route -> required permission map (audit P0-H2 / P0-M2).
//
// Single source of truth shared by the route guard (<RequirePermission>) and the
// sidebar nav filter, so a granted/revoked permission consistently controls BOTH
// whether the link shows AND whether the page loads.
//
// Only CONFIDENTIAL / MANAGEMENT routes are listed. Routes NOT listed are open to
// any authenticated user because they are self-scoped by RLS:
//   /dashboard, /settings, /requests, /my-attendance, and the self-service
//   /ledger + /expenses ("My Ledger" / "My Expenses").
// Note we deliberately do NOT gate the management list pages whose natural
// `*.view` permission is ALSO held by self-service roles for their OWN data
// (attendance.view, leave.view, ledger.view) — gating those at the route would be
// too permissive (a staff user holds attendance.view for their own punches). Those
// stay governed by page-level logic + RLS.
//
// Confidential owner-only areas map to permissions that, by default, only the
// Owner template carries (salaries.view, settlements.run), so default visibility
// is unchanged; an owner can still widen access by granting them via a template.
// ============================================================================

interface RoutePermission {
  /** Match this exact path or any nested path under it (`${prefix}/...`). */
  prefix: string;
  permission: string;
}

export const ROUTE_PERMISSIONS: RoutePermission[] = [
  // Approval queues. Listed so an owner controls who works each queue from
  // Rights Templates rather than it being wired to a role: 'Approve leave'
  // for the leave queue, 'Approve advances & expenses' for the advance one.
  { prefix: '/leave-approvals', permission: 'leave.approve' },
  { prefix: '/approvals', permission: 'approvals.approve' },
  { prefix: '/users', permission: 'users.view' },
  { prefix: '/rights-templates', permission: 'users.manage' },
  // PHASE 2 — new payroll paths keep the existing permission keys. Order
  // matters: the specific /settlements/* rows must come before the bare
  // /settlements prefix (the legacy per-staff screen).
  { prefix: '/payroll/process', permission: 'settlements.run' },
  { prefix: '/payroll/finalized', permission: 'settlements.run' },
  { prefix: '/payroll/increments', permission: 'salaries.edit' },
  { prefix: '/payroll/salary-slips', permission: 'payslips.download' },
  { prefix: '/settlements/payouts', permission: 'payouts.execute' },
  { prefix: '/settlements/arrears', permission: 'settlements.run' },
  { prefix: '/settlements/advances', permission: 'payouts.execute' },
  { prefix: '/settlements/log', permission: 'payouts.execute' },
  { prefix: '/settlements', permission: 'settlements.run' },
  { prefix: '/payroll-groups', permission: 'settlements.run' },
  { prefix: '/arrears', permission: 'settlements.run' },
  { prefix: '/salaries-advances', permission: 'salaries.view' },
  { prefix: '/salary-slips', permission: 'payslips.download' },
  { prefix: '/payouts', permission: 'payouts.execute' },
  { prefix: '/bulk-attendance', permission: 'attendance.manage' },
  { prefix: '/shifts', permission: 'roster.manage' },
  { prefix: '/week-off', permission: 'roster.manage' },
  { prefix: '/roster', permission: 'roster.manage' },
  { prefix: '/biometric-enrolment', permission: 'attendance.manage' },
  { prefix: '/reports', permission: 'reports.view' },
  { prefix: '/audit-log', permission: 'audit.view' },
];

/** The permission a path requires, or null if the route is open to any user. */
export function permissionForPath(pathname: string): string | null {
  const hit = ROUTE_PERMISSIONS.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'),
  );
  return hit ? hit.permission : null;
}
