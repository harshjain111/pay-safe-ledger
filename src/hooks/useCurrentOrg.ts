import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/anyClient';

export interface CurrentOrg {
  id: string;
  name: string;
  short_code: string | null;
  logo_url: string | null;
  plan: string;
  is_active: boolean;
}

export interface CurrentOrgResult {
  org: CurrentOrg | null;
  /** feature keys explicitly DISABLED for this org (denylist). */
  disabled: Set<string>;
}

export const CURRENT_ORG_QUERY_KEY = ['current-org'] as const;

/**
 * Loads the caller's organization + its feature overrides. RLS scopes both
 * `organizations` and `org_features` to the caller's org, so this returns just
 * their tenant. (Phase 1: everyone is in Org #1.)
 */
export function useCurrentOrg() {
  return useQuery({
    queryKey: CURRENT_ORG_QUERY_KEY,
    queryFn: async (): Promise<CurrentOrgResult> => {
      const { data: org, error } = await supabase
        .from('organizations')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const { data: feats, error: fErr } = await supabase
        .from('org_features')
        .select('feature_key, enabled');
      if (fErr) throw fErr;

      const disabled = new Set<string>(
        (feats ?? [])
          .filter((f: { enabled: boolean }) => !f.enabled)
          .map((f: { feature_key: string }) => f.feature_key),
      );
      return { org: (org as CurrentOrg) ?? null, disabled };
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Is a feature enabled for the current org? Default-ON: a feature is enabled
 * unless explicitly disabled, and we return true while loading so a transient
 * miss never hides a module.
 */
export function useFeature(key: string): boolean {
  const { data } = useCurrentOrg();
  if (!data) return true;
  return !data.disabled.has(key);
}
