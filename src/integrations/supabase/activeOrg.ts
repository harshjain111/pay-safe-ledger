// ---------------------------------------------------------------------------
// The active organisation, as the Supabase client sees it.
//
// It lives outside React because the client is created once at module load and
// every request has to carry the current value -- not the one that happened to
// be set when the client was built. OrganizationContext writes here whenever
// the user switches; the fetch wrapper in client.ts reads it per request.
//
// The value is a view preference, not a grant. The restrictive RLS policies
// AND it with the caller's actual memberships, so naming an organisation you
// do not belong to returns nothing rather than someone else's rows.
// ---------------------------------------------------------------------------

export const ACTIVE_ORG_HEADER = 'x-active-org';

let activeOrgId: string | null = null;

export function setActiveOrgHeader(id: string | null): void {
  activeOrgId = id;
}

export function getActiveOrgHeader(): string | null {
  return activeOrgId;
}
