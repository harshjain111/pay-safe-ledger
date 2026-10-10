import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OrganizationProvider, useOrganization } from './OrganizationContext';

const { orgsResult, authUser } = vi.hoisted(() => ({
  orgsResult: vi.fn(),
  authUser: { current: { id: 'user-1' } as { id: string } | null },
}));

vi.mock('@/integrations/supabase/anyClient', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve(orgsResult()) }) }) },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser.current }) }));

const KONNECT = { id: 'org-k', trade_name: 'Konnect 2 Hospitality' };
const GLOO = { id: 'org-g', trade_name: 'Gloo Hospitality' };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <OrganizationProvider>{children}</OrganizationProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient();
  orgsResult.mockReset();
  authUser.current = { id: 'user-1' };
  localStorage.clear();
});

describe('OrganizationContext', () => {
  it('picks the first organisation when nothing is remembered', async () => {
    orgsResult.mockResolvedValue({ data: [KONNECT, GLOO], error: null });
    const { result } = renderHook(() => useOrganization(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeOrgId).toBe('org-k');
    expect(result.current.canSwitch).toBe(true);
  });

  it('is not a switcher when there is only one organisation', async () => {
    orgsResult.mockResolvedValue({ data: [KONNECT], error: null });
    const { result } = renderHook(() => useOrganization(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canSwitch).toBe(false);
    expect(result.current.activeOrg?.trade_name).toBe('Konnect 2 Hospitality');
  });

  it('remembers the choice per user', async () => {
    localStorage.setItem('vibrnd.active-org.user-1', 'org-g');
    orgsResult.mockResolvedValue({ data: [KONNECT, GLOO], error: null });
    const { result } = renderHook(() => useOrganization(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeOrgId).toBe('org-g');
  });

  it('ignores a remembered organisation the user no longer belongs to', async () => {
    // Access can be revoked between sessions. Honouring the stored id would
    // leave the app pointed at an organisation RLS returns nothing for, which
    // reads as "all your data vanished".
    localStorage.setItem('vibrnd.active-org.user-1', 'org-gone');
    orgsResult.mockResolvedValue({ data: [KONNECT], error: null });
    const { result } = renderHook(() => useOrganization(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeOrgId).toBe('org-k');
  });

  it('clears cached data when switching, so the old org does not bleed through', async () => {
    orgsResult.mockResolvedValue({ data: [KONNECT, GLOO], error: null });
    const { result } = renderHook(() => useOrganization(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    client.setQueryData(['staff'], [{ id: 's1', name: 'Konnect person' }]);
    expect(client.getQueryData(['staff'])).toBeTruthy();

    act(() => result.current.setActiveOrg('org-g'));

    expect(result.current.activeOrgId).toBe('org-g');
    expect(client.getQueryData(['staff'])).toBeUndefined();
  });

  it('does not clear the cache when re-selecting the organisation already active', async () => {
    orgsResult.mockResolvedValue({ data: [KONNECT, GLOO], error: null });
    const { result } = renderHook(() => useOrganization(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    client.setQueryData(['staff'], [{ id: 's1' }]);
    act(() => result.current.setActiveOrg('org-k'));

    expect(client.getQueryData(['staff'])).toBeTruthy();
  });

  it('has no organisation when signed out', async () => {
    authUser.current = null;
    const { result } = renderHook(() => useOrganization(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.organizations).toEqual([]);
    expect(result.current.activeOrgId).toBeNull();
  });
});
