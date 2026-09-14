import { fetchSalaryRegister, monthHeading } from './salary-register';

// Shaped on the real August sheet: SANTU SARKAR, 31/31 days, 13,200 contracted,
// basic 6,600 / HRA 3,300 / other 3,300, PF 792, ESI 99, PT 110 → net 12,199.

const { result } = vi.hoisted(() => ({ result: vi.fn() }));

vi.mock('@/integrations/supabase/anyClient', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve(result()) }) }) },
}));
vi.mock('@/lib/masters-cache', () => ({
  fetchMaster: vi.fn().mockResolvedValue([{ id: 'o1', name: 'SY', is_active: true }]),
}));

const settlement = (over: Record<string, unknown> = {}) => ({
  staff_id: 's1',
  base_salary: 13200,
  present_days: 31, half_days: 0, absent_days: 0, paid_leave_days: 0,
  earnings_basic: 6600, earnings_hra: 3300, earnings_allowances: 3300,
  incentives: 0, bonus: 0, overtime_amount: 0, arrears: 0,
  pf_employee: 792, pf_employer: 792,
  esi_employee: 99, esi_employer: 429,
  pt_amount: 110, advances_adjusted: 0, loan_emi_total: 0, discipline_fine: 0,
  net_salary: 12199,
  staff: { full_name: 'SANTU SARKAR', employee_id: 'K2H001', department: 'SERVICE STAFF', designation: 'CAPTAIN', outlet_id: 'o1' },
  ...over,
});

beforeEach(() => result.mockReset());

describe('fetchSalaryRegister', () => {
  it('reproduces a row from the accountant’s sheet', async () => {
    result.mockReturnValue({ data: [settlement()], error: null });
    const reg = await fetchSalaryRegister('2026-08');
    const r = reg.rows[0];

    expect(r.slNo).toBe(1);
    expect(r.name).toBe('SANTU SARKAR');
    // Their OUTLET column is outlet and department together.
    expect(r.outlet).toBe('SY - SERVICE STAFF');
    expect(r.designation).toBe('CAPTAIN');
    expect(r.workingDays).toBe(31);
    expect(r.gross).toBe(13200);
    expect(r.totalDeductions).toBe(1001);   // 792 + 99 + 110
    expect(r.net).toBe(12199);
    expect(r.totalEmployerContribution).toBe(1221); // 792 + 429
  });

  it('counts a half day as half and paid leave as present', async () => {
    result.mockReturnValue({
      data: [settlement({ present_days: 20, half_days: 4, paid_leave_days: 3, absent_days: 4 })],
      error: null,
    });
    const reg = await fetchSalaryRegister('2026-08');
    expect(reg.rows[0].present).toBe(25);   // 20 + 4x0.5 + 3
    expect(reg.rows[0].absent).toBe(4);
  });

  it('folds loan EMI and fines into the advance column', async () => {
    // The sheet has one ADVANCE column; anything recovered from pay belongs in
    // it, or the row stops adding up to net.
    result.mockReturnValue({
      data: [settlement({ advances_adjusted: 2000, loan_emi_total: 500, discipline_fine: 100 })],
      error: null,
    });
    const r = (await fetchSalaryRegister('2026-08')).rows[0];
    expect(r.advance).toBe(2600);
    expect(r.totalDeductions).toBe(792 + 99 + 110 + 2600);
  });

  it('adds incentives, bonus, overtime and arrears into gross', async () => {
    result.mockReturnValue({
      data: [settlement({ incentives: 500, bonus: 1000, overtime_amount: 250, arrears: 750 })],
      error: null,
    });
    expect((await fetchSalaryRegister('2026-08')).rows[0].gross).toBe(13200 + 2500);
  });

  it('totals the column, and numbers the rows after sorting', async () => {
    result.mockReturnValue({
      data: [
        settlement({ staff: { full_name: 'ZAHID', department: 'SERVICE STAFF', designation: 'X', outlet_id: 'o1', employee_id: 'b' } }),
        settlement({ staff: { full_name: 'ABID', department: 'SERVICE STAFF', designation: 'X', outlet_id: 'o1', employee_id: 'a' } }),
      ],
      error: null,
    });
    const reg = await fetchSalaryRegister('2026-08');
    expect(reg.rows.map((r) => r.name)).toEqual(['ABID', 'ZAHID']);
    expect(reg.rows.map((r) => r.slNo)).toEqual([1, 2]);
    expect(reg.totals.gross).toBe(26400);
    expect(reg.totals.net).toBe(24398);
    expect(reg.totals.pfEmployee).toBe(1584);
  });

  it('returns an empty register rather than throwing when nothing is settled', async () => {
    result.mockReturnValue({ data: [], error: null });
    const reg = await fetchSalaryRegister('2026-08');
    expect(reg.rows).toEqual([]);
    expect(reg.totals.gross).toBe(0);
  });

  it('surfaces a query failure instead of reporting zeros', async () => {
    result.mockReturnValue({ data: null, error: { message: 'permission denied' } });
    await expect(fetchSalaryRegister('2026-08')).rejects.toBeTruthy();
  });
});

describe('monthHeading', () => {
  it('matches the heading style of the existing sheet', () => {
    expect(monthHeading('2026-08')).toBe("AUGUST'26");
    expect(monthHeading('2026-01')).toBe("JANUARY'26");
    expect(monthHeading('2025-12')).toBe("DECEMBER'25");
  });
});
