import { supabase } from '@/integrations/supabase/client';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import type { User } from '@supabase/supabase-js';
import type { LoginResetRequest, Staff } from '@/types/database';

/**
 * Shared login-reset request mutations.
 *
 * A login-reset flows through the unified Approvals inbox exactly like an
 * advance or expense (pending → approved / rejected). Approving performs the
 * ACTUAL credential reset via the owner-only `reset-user-password` edge function
 * and notifies the staff member; every raise / approve / reject is captured in
 * the Audit Log by the log_audit_entry() trigger on login_reset_requests.
 *
 * Both the Approvals page (manager-on-behalf) and the Requests page
 * (staff self-service) call these, so the logic is never forked.
 */

// The credential a reset lands on — the same default the owner-facing
// ResetPasswordDialog offers. The staff member is told to change it after login.
export const DEFAULT_RESET_PASSWORD = '123456';

/**
 * Pure guard for approving a login reset. Returns an error message when the
 * action is not allowed, or null when it is. Unit-tested.
 */
export function loginResetApprovalError(opts: {
  status: string;
  beneficiaryUserId: string | null | undefined;
  approverUserId: string | undefined;
}): string | null {
  if (opts.status !== 'pending') return 'This request has already been reviewed';
  if (!opts.beneficiaryUserId) return 'This staff member has no app login to reset';
  if (opts.beneficiaryUserId === opts.approverUserId) return 'You cannot approve a login reset for yourself';
  return null;
}

/** Raise a login-reset request (staff for self, or a manager on their behalf). */
export async function raiseLoginResetRequest(opts: {
  staffId: string;
  reason: string;
  requestedBy: string | null;
}): Promise<void> {
  const { error } = await supabase.from('login_reset_requests').insert({
    staff_id: opts.staffId,
    reason: opts.reason.trim(),
    requested_by: opts.requestedBy,
    status: 'pending',
  });
  if (error) throw error;
}

/**
 * Approve a login reset — performs the credential reset, then records the
 * decision and notifies the staff member.
 */
export async function approveLoginResetRequest(opts: {
  request: LoginResetRequest;
  user: User | null;
  staffData: Staff | null;
}): Promise<void> {
  const { request, user, staffData } = opts;
  const beneficiaryUserId = request.staff?.user_id ?? null;

  // Maker-checker + state guard (also re-validated below for narrowing).
  const guard = loginResetApprovalError({
    status: request.status,
    beneficiaryUserId,
    approverUserId: user?.id,
  });
  if (guard || !beneficiaryUserId) throw new Error(guard ?? 'This staff member has no app login to reset');

  const staffName = request.staff?.full_name ?? 'Staff';

  // 1. Perform the ACTUAL credential reset (owner-only edge function).
  const { error: resetError } = await supabase.functions.invoke('reset-user-password', {
    body: { userId: beneficiaryUserId, newPassword: DEFAULT_RESET_PASSWORD, userName: staffName },
  });
  if (resetError) throw resetError;

  // 2. Mark the request approved (this UPDATE is captured in the Audit Log).
  const reviewerName = getUserDisplayName(user, staffData);
  const { error } = await supabase
    .from('login_reset_requests')
    .update({
      status: 'approved',
      reviewed_by: user?.id ?? null,
      reviewed_by_name: reviewerName,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', request.id);
  if (error) throw error;

  // 3. Notify the staff member that their login has been reset.
  await supabase.rpc('create_notification', {
    _user_id: beneficiaryUserId,
    _title: 'Login Reset',
    _message: `Your app login has been reset to the default password (${DEFAULT_RESET_PASSWORD}). Please sign in and change it in Settings.`,
    _type: 'warning',
    _reference_type: 'login_reset_request',
    _reference_id: request.id,
  });
}

/** Reject a login reset — records the decision and notifies the staff member. */
export async function rejectLoginResetRequest(opts: {
  request: LoginResetRequest;
  reason: string;
  user: User | null;
  staffData: Staff | null;
}): Promise<void> {
  const { request, reason, user, staffData } = opts;
  if (request.status !== 'pending') throw new Error('This request has already been reviewed');

  const reviewerName = getUserDisplayName(user, staffData);
  const { error } = await supabase
    .from('login_reset_requests')
    .update({
      status: 'rejected',
      reviewed_by: user?.id ?? null,
      reviewed_by_name: reviewerName,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', request.id);
  if (error) throw error;

  if (request.staff?.user_id) {
    await supabase.rpc('create_notification', {
      _user_id: request.staff.user_id,
      _title: 'Login Reset Declined',
      _message: `Your login-reset request was declined. Reason: ${reason}`,
      _type: 'error',
      _reference_type: 'login_reset_request',
      _reference_id: request.id,
    });
  }
}
