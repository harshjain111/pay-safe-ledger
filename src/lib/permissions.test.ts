import { describe, it, expect } from 'vitest';
import {
  resolveEffectivePermissions,
  can,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
} from './permissions';

describe('resolveEffectivePermissions', () => {
  it('owner gets every permission', () => {
    const eff = resolveEffectivePermissions({ isOwner: true, templatePermissions: [] });
    expect(eff.size).toBe(ALL_PERMISSIONS.length);
    expect(eff.has('settings.payroll.edit')).toBe(true);
    expect(eff.has('settings.data.manage')).toBe(true);
  });

  it('a template grants exactly its permissions', () => {
    const eff = resolveEffectivePermissions({ isOwner: false, templatePermissions: ['ledger.view', 'reports.view'] });
    expect([...eff].sort()).toEqual(['ledger.view', 'reports.view']);
  });

  it('per-user grants are added and revokes are removed', () => {
    const eff = resolveEffectivePermissions({
      isOwner: false,
      templatePermissions: ['ledger.view', 'reports.view'],
      granted: ['expenses.view'],
      revoked: ['reports.view'],
    });
    expect(eff.has('expenses.view')).toBe(true);
    expect(eff.has('reports.view')).toBe(false);
    expect(eff.has('ledger.view')).toBe(true);
  });

  it('a revoke overrides a same-key grant', () => {
    const eff = resolveEffectivePermissions({
      isOwner: false,
      templatePermissions: [],
      granted: ['ledger.view'],
      revoked: ['ledger.view'],
    });
    expect(eff.has('ledger.view')).toBe(false);
  });
});

describe('can', () => {
  it('checks membership', () => {
    const eff = resolveEffectivePermissions({ isOwner: false, templatePermissions: ['ledger.view'] });
    expect(can(eff, 'ledger.view')).toBe(true);
    expect(can(eff, 'settings.payroll.edit')).toBe(false);
    expect(can(null, 'ledger.view')).toBe(false);
  });
});

describe('ROLE_PERMISSIONS (no-lockout mapping)', () => {
  it('owner maps to all permissions', () => {
    expect(ROLE_PERMISSIONS.owner.length).toBe(ALL_PERMISSIONS.length);
  });
  it('non-owner roles never get owner-only permissions', () => {
    for (const role of ['admin', 'accountant', 'staff', 'ca'] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('settings.payroll.edit');
      expect(ROLE_PERMISSIONS[role]).not.toContain('settings.data.manage');
      expect(ROLE_PERMISSIONS[role]).not.toContain('salaries.view');
    }
  });
  it('admin can approve; staff cannot', () => {
    expect(ROLE_PERMISSIONS.admin).toContain('approvals.approve');
    expect(ROLE_PERMISSIONS.staff).not.toContain('approvals.approve');
  });
});
