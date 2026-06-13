import { renderHook, waitFor, act } from '@testing-library/react';
import { useSingletonSettings } from './useSingletonSettings';

// Chainable supabase mock: from().select().maybeSingle() and from().update().eq()
const { maybeSingle, eq } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ maybeSingle }),
      update: () => ({ eq }),
    }),
  },
}));

beforeEach(() => {
  maybeSingle.mockReset();
  eq.mockReset();
});

// Regression coverage for the two Settings endpoints that were failing:
// `leave_settings` and `hr_pay_rules` (both load through this hook).
describe('useSingletonSettings', () => {
  it('loads the singleton row cleanly on success (no error toast)', async () => {
    maybeSingle.mockResolvedValue({ data: { annual_quota: 18, accrual: 'monthly' }, error: null });

    const { result } = renderHook(() => useSingletonSettings('leave_settings', 'annual_quota, accrual'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.data).toEqual({ annual_quota: 18, accrual: 'monthly' });
  });

  it('flags error when the relation is missing / the query fails', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'relation "public.hr_pay_rules" does not exist' },
    });

    const { result } = renderHook(() => useSingletonSettings('hr_pay_rules', '*'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('does not query when disabled (caller lacks permission)', async () => {
    const { result } = renderHook(() => useSingletonSettings('leave_settings', '*', false));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(result.current.error).toBe(false);
  });

  it('save() rejects on failure so the panel can block + surface it', async () => {
    maybeSingle.mockResolvedValue({ data: {}, error: null });
    eq.mockResolvedValue({ error: { message: 'permission denied' } });

    const { result } = renderHook(() => useSingletonSettings('hr_pay_rules', '*'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.save({ comp_off_enabled: true })).rejects.toBeTruthy();
  });

  it('reload() retries and clears the error after a transient failure', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'network' } });

    const { result } = renderHook(() => useSingletonSettings('leave_settings', '*'));
    await waitFor(() => expect(result.current.error).toBe(true));

    maybeSingle.mockResolvedValueOnce({ data: { annual_quota: 12 }, error: null });
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBe(false);
    expect(result.current.data).toEqual({ annual_quota: 12 });
  });
});
