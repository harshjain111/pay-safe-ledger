import { useMemo } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import type { OrgProfile } from '@/lib/organization';

export const ORG_PROFILE_QUERY_KEY = ['organization-profile'] as const;

/**
 * The organisation currently being viewed.
 *
 * This used to be `organization_profile` LIMIT 1, which was right while the
 * table was pinned to a single row. It now reads the active organisation from
 * OrganizationContext, so a user who belongs to two companies sees the one
 * they picked rather than whichever sorted first.
 *
 * The return shape is unchanged -- { data, isLoading } -- so every existing
 * caller keeps working.
 */
export function useOrganizationProfile(): { data: OrgProfile | null; isLoading: boolean } {
  const { activeOrg, isLoading } = useOrganization();
  return useMemo(() => ({ data: activeOrg, isLoading }), [activeOrg, isLoading]);
}

/**
 * Whether the break-time concept (start/end break, break timer, break minutes)
 * is enabled for this org. Default-ON: true while loading or if the flag is
 * absent, so a transient miss never wrongly hides it.
 */
export function useBreaksEnabled(): boolean {
  const { data } = useOrganizationProfile();
  return data?.breaks_enabled !== false;
}

/**
 * Whether in-app self check-in/out ("Ready for your shift?") is enabled for the
 * org. Default-ON while loading or if the flag is absent, so a transient miss
 * never wrongly hides it. Per-employee access is gated separately by
 * staff.self_checkin_allowed.
 */
export function useSelfCheckinEnabled(): boolean {
  const { data } = useOrganizationProfile();
  return data?.self_checkin_enabled !== false;
}
