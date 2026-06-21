import { supabase } from '@/integrations/supabase/client';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import type { User } from '@supabase/supabase-js';
import type { PaymentRequest, Staff } from '@/types/database';

/**
 * Shared advance-request (payment_request) approval mutations.
 *
 * Single source of truth for approving / rejecting an advance. Both the Requests
 * page and the consolidated Approvals page call these, so the business logic
 * (status update + maker-checker guard + notifications) is never forked.
 */

export async function approveAdvanceRequest(opts: {
  request: PaymentRequest;
  user: User | null;
  staffData: Staff | null;
}): Promise<void> {
  const { request, user, staffData } = opts;

  // Maker-checker: you cannot approve a request where YOU are the beneficiary.
  if (request.staff?.user_id && request.staff.user_id === user?.id) {
    throw new Error('You cannot approve requests for yourself');
  }

  const approverName = getUserDisplayName(user, staffData);

  // Claim-first: only a still-pending row transitions, so a double-click / second
  // reviewer / stale drawer can't re-approve and re-notify a terminal request.
  const { data: updated, error } = await supabase
    .from('payment_requests')
    .update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      approved_by_user_name: approverName,
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;
  if (!updated || updated.length === 0) throw new Error('This request was already actioned.');

  // Notify the staff member.
  if (request.staff?.user_id) {
    await supabase.rpc('create_notification', {
      _user_id: request.staff.user_id,
      _title: 'Request Approved',
      _message: `Your payment request of ₹${request.amount.toLocaleString('en-IN')} has been approved and is ready for payout.`,
      _type: 'success',
      _reference_type: 'payment_request',
      _reference_id: request.id,
    });
  }

  // Notify payout executors (server-side fan-out; excludes the approver).
  await supabase.rpc('notify_users_by_role', {
    _roles: ['accountant', 'owner', 'admin'],
    _title: 'Request Ready for Payout',
    _message: `Advance request for ${request.staff?.full_name ?? 'staff'} (₹${request.amount.toLocaleString('en-IN')}) is approved and ready in Payouts.`,
    _type: 'info',
    _reference_type: 'payment_request',
    _reference_id: request.id,
  });
}

export async function rejectAdvanceRequest(opts: {
  request: PaymentRequest;
  reason: string;
  user: User | null;
  staffData: Staff | null;
}): Promise<void> {
  const { request, reason, user, staffData } = opts;
  const approverName = getUserDisplayName(user, staffData);

  const { data: updated, error } = await supabase
    .from('payment_requests')
    .update({
      status: 'rejected',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
      approved_by_user_name: approverName,
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;
  if (!updated || updated.length === 0) throw new Error('This request was already actioned.');

  if (request.staff?.user_id) {
    await supabase.rpc('create_notification', {
      _user_id: request.staff.user_id,
      _title: 'Request Rejected',
      _message: `Your payment request of ₹${request.amount.toLocaleString('en-IN')} has been rejected. Reason: ${reason}`,
      _type: 'error',
      _reference_type: 'payment_request',
      _reference_id: request.id,
    });
  }
}
