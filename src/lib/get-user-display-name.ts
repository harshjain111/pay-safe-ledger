import { User } from '@supabase/supabase-js';
import type { Staff } from '@/types/database';

/**
 * Resolves the display name for the current user.
 * Priority: staffData.full_name > user_metadata.full_name > email username > email > 'Unknown'
 */
export function getUserDisplayName(
  user: User | null,
  staffData: Staff | null
): string {
  if (staffData?.full_name) return staffData.full_name;
  if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user?.user_metadata?.name) return user.user_metadata.name;
  if (user?.email) {
    // Use the part before @ as a readable name
    const emailName = user.email.split('@')[0];
    // Capitalize first letter
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }
  return 'Unknown';
}
