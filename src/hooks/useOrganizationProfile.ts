import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/anyClient';
import type { OrgProfile } from '@/lib/organization';

export const ORG_PROFILE_QUERY_KEY = ['organization-profile'] as const;

/** Loads the single organization-profile row (name + logo + details). */
export function useOrganizationProfile() {
  return useQuery({
    queryKey: ORG_PROFILE_QUERY_KEY,
    queryFn: async (): Promise<OrgProfile | null> => {
      const { data, error } = await supabase
        .from('organization_profile')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as OrgProfile) ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether the break-time concept (start/end break, break timer, break minutes)
 * is enabled for this org. Default-ON: true while loading or if the flag is
 * absent, so a transient miss never wrongly hides it.
 */
export function useBreaksEnabled(): boolean {
  const { data } = useOrganizationProfile();
  return (data as (OrgProfile & { breaks_enabled?: boolean }) | null)?.breaks_enabled !== false;
}
