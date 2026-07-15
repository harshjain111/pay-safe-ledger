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
