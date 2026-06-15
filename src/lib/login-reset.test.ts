import { describe, it, expect } from 'vitest';
import { loginResetApprovalError, DEFAULT_RESET_PASSWORD } from './login-reset';

describe('loginResetApprovalError (maker-checker guard)', () => {
  it('allows a pending request for another user', () => {
    expect(
      loginResetApprovalError({ status: 'pending', beneficiaryUserId: 'u2', approverUserId: 'u1' })
    ).toBeNull();
  });

  it('blocks an already-reviewed request', () => {
    expect(
      loginResetApprovalError({ status: 'approved', beneficiaryUserId: 'u2', approverUserId: 'u1' })
    ).toMatch(/already/i);
  });

  it('blocks self-approval (you cannot reset your own login)', () => {
    expect(
      loginResetApprovalError({ status: 'pending', beneficiaryUserId: 'u1', approverUserId: 'u1' })
    ).toMatch(/yourself/i);
  });

  it('blocks when the staff member has no app login', () => {
    expect(
      loginResetApprovalError({ status: 'pending', beneficiaryUserId: null, approverUserId: 'u1' })
    ).toMatch(/no app login/i);
  });
});

describe('DEFAULT_RESET_PASSWORD', () => {
  it('meets the 6-character minimum enforced by the edge function', () => {
    expect(DEFAULT_RESET_PASSWORD.length).toBeGreaterThanOrEqual(6);
  });
});
