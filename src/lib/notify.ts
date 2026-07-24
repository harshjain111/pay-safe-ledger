import { supabase } from '@/integrations/supabase/anyClient';

export type NotifyType = 'info' | 'success' | 'warning' | 'error';

interface NotifyOpts {
  type?: NotifyType;
  referenceType?: string | null;
  referenceId?: string | null;
}

/**
 * Notify a specific set of users (fan-out). Fire-and-forget: notification
 * failures never block the primary action.
 */
export async function notifyUsers(userIds: string[], title: string, message: string, opts: NotifyOpts = {}) {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  try {
    await supabase.rpc('notify_users', {
      _user_ids: ids,
      _title: title,
      _message: message,
      _type: opts.type ?? 'info',
      _reference_type: opts.referenceType ?? null,
      _reference_id: opts.referenceId ?? null,
    });
  } catch (e) {
    console.error('notifyUsers failed', e);
  }
}

/**
 * Notify management — every owner, plus (optionally) a staff member's reporting
 * manager. The actor is excluded server-side. Use for "who changed what" events
 * (setting changes, adjustments, new joiners, shift edits).
 */
export async function notifyManagement(title: string, message: string, opts: NotifyOpts & { staffId?: string | null } = {}) {
  try {
    await supabase.rpc('notify_management', {
      _title: title,
      _message: message,
      _type: opts.type ?? 'info',
      _staff_id: opts.staffId ?? null,
      _reference_type: opts.referenceType ?? null,
      _reference_id: opts.referenceId ?? null,
    });
  } catch (e) {
    console.error('notifyManagement failed', e);
  }
}
