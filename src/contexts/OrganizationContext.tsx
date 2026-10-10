import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { setActiveOrgHeader } from '@/integrations/supabase/activeOrg';
import type { OrgProfile } from '@/lib/organization';

// ---------------------------------------------------------------------------
// Which company you are looking at.
//
// RLS lets a user read every organisation they hold a role in, which is the
// right rule for the database but the wrong thing to render: someone who runs
// two companies would see one merged staff list. The active organisation is
// the app's answer to that -- one company at a time, chosen here.
//
// Switching clears the react-query cache. Without that, the previous
// organisation's staff, payroll and attendance stay on screen under the new
// company's name until each query happens to refetch, which is a worse failure
// than a slow switch: it looks like real data for the wrong business.
//
// The choice is remembered per user, not globally, so two accounts on one
// machine do not inherit each other's last organisation.
// ---------------------------------------------------------------------------

export interface OrgMembership extends OrgProfile {
  is_active?: boolean;
}

interface OrganizationContextValue {
  /** Every organisation the signed-in user holds a role in. */
  organizations: OrgMembership[];
  activeOrg: OrgMembership | null;
  activeOrgId: string | null;
  setActiveOrg: (id: string) => void;
  /** True once more than one organisation is available to switch between. */
  canSwitch: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

const storageKey = (userId: string) => `vibrnd.active-org.${userId}`;

function readStored(userId: string): string | null {
  try { return localStorage.getItem(storageKey(userId)); } catch { return null; }
}
function writeStored(userId: string, id: string) {
  try { localStorage.setItem(storageKey(userId), id); } catch { /* private mode */ }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [organizations, setOrganizations] = useState<OrgMembership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setActiveOrgHeader(null);
      setOrganizations([]);
      setActiveOrgId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // RLS already limits this to the organisations the caller belongs to,
      // so there is no filter to write here and none to forget.
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('trade_name');
      if (error) throw error;
      const rows = ((data ?? []) as OrgMembership[]).filter((o) => o.is_active !== false);
      setOrganizations(rows);

      // Prefer the last choice, but only if it is still one of theirs --
      // access can be removed between sessions.
      const stored = readStored(user.id);
      const valid = stored && rows.some((o) => o.id === stored) ? stored : rows[0]?.id ?? null;
      // Publish to the Supabase client first: every query from here narrows to
      // this organisation, and a query that beats the header would read across
      // all of them.
      setActiveOrgHeader(valid);
      setActiveOrgId(valid);
      if (valid) writeStored(user.id, valid);
    } catch {
      // Leave whatever was already loaded rather than blanking the app.
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const setActiveOrg = useCallback((id: string) => {
    if (!user || id === activeOrgId) return;
    // Order matters: the header has to be the new organisation before the
    // cache is dropped, or the refetches it triggers would carry the old one.
    setActiveOrgHeader(id);
    setActiveOrgId(id);
    writeStored(user.id, id);
    // Everything cached belongs to the organisation we are leaving.
    queryClient.clear();
  }, [user, activeOrgId, queryClient]);

  const value = useMemo<OrganizationContextValue>(() => ({
    organizations,
    activeOrg: organizations.find((o) => o.id === activeOrgId) ?? null,
    activeOrgId,
    setActiveOrg,
    canSwitch: organizations.length > 1,
    isLoading,
    refresh: load,
  }), [organizations, activeOrgId, setActiveOrg, isLoading, load]);

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error('useOrganization must be used inside <OrganizationProvider>');
  }
  return ctx;
}
