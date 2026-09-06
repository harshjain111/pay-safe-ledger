import { render, screen, waitFor } from '@testing-library/react';
import MySalarySlips from './MySalarySlips';

// The bug this covers: a failed read used to fall through to the "No salary
// slips yet" empty state. To an employee that reads as "you have never been
// paid" — a very different and more alarming claim than "this did not load".

const { settlements, locks } = vi.hoisted(() => ({
  settlements: vi.fn(),
  locks: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) =>
      table === 'salary_settlements'
        ? { select: () => ({ eq: () => ({ order: () => Promise.resolve(settlements()) }) }) }
        : { select: () => ({ in: () => Promise.resolve(locks()) }) },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ staffData: { id: 'staff-1', full_name: 'ABID ALI' } }),
}));
vi.mock('@/hooks/useOrganizationProfile', () => ({ useOrganizationProfile: () => ({ data: null }) }));
vi.mock('@/lib/payslip-pdf', () => ({ downloadPayslipPDF: vi.fn() }));
vi.mock('@/lib/payslip-extras', () => ({
  fetchPayslipExtras: vi.fn(), orgToPayslipOrg: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const slip = (month: string, paid: boolean) => ({
  id: month, settlement_month: month, paid_at: paid ? '2026-09-01' : null,
  net_payable: 1000, gross_earnings: 1000, total_deductions: 0,
});

beforeEach(() => { settlements.mockReset(); locks.mockReset(); });

describe('MySalarySlips', () => {
  it('says the load failed instead of claiming there are no slips', async () => {
    settlements.mockResolvedValue({ data: null, error: { message: 'network' } });
    locks.mockResolvedValue({ data: [], error: null });

    render(<MySalarySlips />);

    await waitFor(() => expect(screen.getByText("Couldn't load your salary slips")).toBeInTheDocument());
    expect(screen.queryByText('No salary slips yet')).not.toBeInTheDocument();
  });

  it('warns that the list may be short when the lock table cannot be read', async () => {
    settlements.mockResolvedValue({ data: [slip('2026-08', true), slip('2026-07', false)], error: null });
    locks.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    render(<MySalarySlips />);

    // The paid month still shows; the unpaid one is correctly withheld (an
    // employee must never see a draft slip) — but not in silence.
    await waitFor(() => expect(screen.getByText(/Some finalized months may be missing/)).toBeInTheDocument());
  });

  it('shows a finalized-but-unpaid month once its sheet is locked', async () => {
    settlements.mockResolvedValue({ data: [slip('2026-07', false)], error: null });
    locks.mockResolvedValue({ data: [{ month: '2026-07' }], error: null });

    render(<MySalarySlips />);

    await waitFor(() => expect(screen.queryByText('No salary slips yet')).not.toBeInTheDocument());
    expect(screen.queryByText(/Some finalized months may be missing/)).not.toBeInTheDocument();
  });

  it('still shows the genuine empty state when there is nothing to show', async () => {
    settlements.mockResolvedValue({ data: [], error: null });
    locks.mockResolvedValue({ data: [], error: null });

    render(<MySalarySlips />);

    await waitFor(() => expect(screen.getByText('No salary slips yet')).toBeInTheDocument());
  });
});
