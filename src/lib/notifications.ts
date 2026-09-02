import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/database';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface NotificationRecipients {
  owners?: boolean;
  admins?: boolean;
  accountants?: boolean;
  hr?: boolean;
  staffUserId?: string;
}


/**
 * Send notification to specific user
 */
export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  referenceType?: string,
  referenceId?: string
): Promise<void> {
  try {
    await supabase.rpc('create_notification', {
      _user_id: userId,
      _title: title,
      _message: message,
      _type: type,
      _reference_type: referenceType || null,
      _reference_id: referenceId || null,
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

/**
 * Send notifications to users by role
 */
export async function sendNotificationsByRole(
  recipients: NotificationRecipients,
  title: string,
  message: string,
  type: NotificationType = 'info',
  referenceType?: string,
  referenceId?: string
): Promise<void> {
  try {
    const rolesToNotify: AppRole[] = [];
    
    if (recipients.owners) rolesToNotify.push('owner');
    if (recipients.admins) rolesToNotify.push('admin');
    if (recipients.accountants) rolesToNotify.push('accountant');
    if (recipients.hr) rolesToNotify.push('hr');
    
    // Fan out to every user holding one of these roles. This runs server-side
    // via the SECURITY DEFINER notify_users_by_role() RPC, so the client never
    // needs to read user_roles directly (that table is now privileged-only).
    if (rolesToNotify.length > 0) {
      await supabase.rpc('notify_users_by_role', {
        _roles: rolesToNotify,
        _title: title,
        _message: message,
        _type: type,
        _reference_type: referenceType || null,
        _reference_id: referenceId || null,
      });
    }
    
    // Also notify specific staff user if provided
    if (recipients.staffUserId) {
      await sendNotification(
        recipients.staffUserId,
        title,
        message,
        type,
        referenceType,
        referenceId
      );
    }

    // TODO: Send Telegram to owner for all important events (recipients.owners)
  } catch (error) {
    console.error('Failed to send notifications by role:', error);
  }
}

// Pre-defined notification events
export const NotificationEvents = {
  // Staff events
  staffCreatedWithoutSalary: async (staffName: string, staffId: string, creatorRole: string) => {
    await sendNotificationsByRole(
      { owners: true },
      'Salary Required for New Staff',
      `${staffName} has been added by ${creatorRole}. Please set their monthly salary.`,
      'warning',
      'staff',
      staffId
    );
  },
  
  // Request events
  advanceRequested: async (staffName: string, amount: number, requestId: string) => {
    await sendNotificationsByRole(
      { owners: true, admins: true },
      'New Advance Request',
      `${staffName} has requested an advance of ₹${amount.toLocaleString('en-IN')}.`,
      'info',
      'payment_request',
      requestId
    );
  },
  
  // Approval events
  advanceApproved: async (staffUserId: string, staffName: string, amount: number, requestId: string) => {
    // Notify staff
    await sendNotification(
      staffUserId,
      'Advance Approved',
      `Your advance request of ₹${amount.toLocaleString('en-IN')} has been approved.`,
      'success',
      'payment_request',
      requestId
    );
    // Notify accountants for payout
    await sendNotificationsByRole(
      { accountants: true },
      'Advance Ready for Payout',
      `An advance of ₹${amount.toLocaleString('en-IN')} for ${staffName} has been approved and is ready for payout.`,
      'info',
      'payment_request',
      requestId
    );
    // Telegram to owner
  },
  
  advanceRejected: async (staffUserId: string, staffName: string, amount: number, reason: string, requestId: string) => {
    await sendNotification(
      staffUserId,
      'Advance Rejected',
      `Your advance request of ₹${amount.toLocaleString('en-IN')} has been rejected. Reason: ${reason}`,
      'error',
      'payment_request',
      requestId
    );
    // Telegram to owner
  },
  
  // Payment events
  advancePaid: async (staffUserId: string, staffName: string, amount: number, requestId: string) => {
    await sendNotification(
      staffUserId,
      'Advance Paid',
      `Your advance of ₹${amount.toLocaleString('en-IN')} has been paid.`,
      'success',
      'payment_request',
      requestId
    );
    // Telegram to owner
  },
  
  // Salary events
  salarySettled: async (staffName: string, month: string, amount: number, settlementId: string) => {
    await sendNotificationsByRole(
      { owners: true },
      'Salary Settled',
      `Salary for ${staffName} for ${month} has been settled. Net payable: ₹${amount.toLocaleString('en-IN')}.`,
      'success',
      'salary_settlement',
      settlementId
    );
  },
  
  salaryPaid: async (staffUserId: string, staffName: string, month: string, amount: number, settlementId: string) => {
    await sendNotification(
      staffUserId,
      'Salary Paid',
      `Your salary for ${month} of ₹${amount.toLocaleString('en-IN')} has been paid.`,
      'success',
      'salary_settlement',
      settlementId
    );
    // Telegram to owner
  },

  // Leave events
  leaveRequested: async (staffName: string, leaveDate: string) => {
    await sendNotificationsByRole(
      { owners: true, admins: true, hr: true },
      'New Leave Request',
      `${staffName} has requested leave on ${leaveDate}.`,
      'info',
      'leave',
    );
  },

  leaveApproved: async (staffUserId: string, staffName: string, leaveDate: string, deductionDays: number) => {
    await sendNotification(
      staffUserId,
      'Leave Approved',
      `Your leave on ${leaveDate} has been approved with ${deductionDays} day(s) deduction.`,
      'success',
      'leave',
    );
    // Telegram to owner
  },

  leaveRejected: async (staffUserId: string, staffName: string, leaveDate: string, reason: string) => {
    await sendNotification(
      staffUserId,
      'Leave Rejected',
      `Your leave on ${leaveDate} has been rejected. Reason: ${reason}`,
      'error',
      'leave',
    );
    // Telegram to owner
  },

  leaveMarked: async (staffName: string, leaveDate: string, leaveType: string) => {
    // Telegram to owner for leave marked by admin/accountant
  },

  // Payout events
  payoutMade: async (staffName: string, amount: number, payoutType: string) => {
  },

  // Salary revision events
  salaryBulkUpdated: async (
    summary: { updated: number; increments: number; decrements: number; net_delta: number },
    actorName: string,
  ) => {
    const rupees = (n: number) =>
      `${n < 0 ? '-' : '+'}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
    const parts: string[] = [];
    if (summary.increments) parts.push(`${summary.increments} increment${summary.increments > 1 ? 's' : ''}`);
    if (summary.decrements) parts.push(`${summary.decrements} reduction${summary.decrements > 1 ? 's' : ''}`);
    const detail = parts.length ? ` (${parts.join(', ')})` : '';
    await sendNotificationsByRole(
      { owners: true },
      'Salaries Updated',
      `${actorName} updated ${summary.updated} salar${summary.updated === 1 ? 'y' : 'ies'}${detail}. Net change: ${rupees(summary.net_delta)}/month.`,
      summary.increments === 0 && summary.decrements > 0 ? 'warning' : 'success',
      'salary',
    );
  },
};
