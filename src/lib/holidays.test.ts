import { describe, it, expect } from 'vitest';
import {
  isMandatoryPaid,
  holidayOccurrencesInRange,
  resolveHolidayDatesByStaff,
  resolveHolidayDatesForStaff,
  expandHolidaysInRange,
  type HolidayRow,
  type HolidayAssignmentRow,
} from './holidays';

const mk = (over: Partial<HolidayRow>): HolidayRow => ({
  id: 'h', name: 'X', date: '2026-01-26', type: 'public', is_paid: true, recurring_yearly: false, org_wide: true,
  ...over,
});

describe('isMandatoryPaid', () => {
  it('only public + paid holidays are auto-applied', () => {
    expect(isMandatoryPaid(mk({}))).toBe(true);
    expect(isMandatoryPaid(mk({ type: 'optional' }))).toBe(false);
    expect(isMandatoryPaid(mk({ type: 'restricted' }))).toBe(false);
    expect(isMandatoryPaid(mk({ is_paid: false }))).toBe(false);
  });
});

describe('holidayOccurrencesInRange', () => {
  it('returns a fixed holiday when it falls in range', () => {
    expect(holidayOccurrencesInRange(mk({ date: '2026-06-15' }), '2026-06-01', '2026-06-30')).toEqual(['2026-06-15']);
  });
  it('excludes a fixed holiday outside the range', () => {
    expect(holidayOccurrencesInRange(mk({ date: '2026-05-15' }), '2026-06-01', '2026-06-30')).toEqual([]);
  });
  it('projects a recurring holiday onto each year in range', () => {
    const h = mk({ date: '2020-01-26', recurring_yearly: true });
    expect(holidayOccurrencesInRange(h, '2026-01-01', '2027-12-31')).toEqual(['2026-01-26', '2027-01-26']);
  });
  it('skips 29 Feb in non-leap years', () => {
    const h = mk({ date: '2024-02-29', recurring_yearly: true });
    // 2026 & 2027 are non-leap, 2028 is leap
    expect(holidayOccurrencesInRange(h, '2026-01-01', '2028-12-31')).toEqual(['2028-02-29']);
  });
});

describe('scope resolution', () => {
  const staffA = { id: 'sA', outlet_id: 'o1' };
  const staffB = { id: 'sB', outlet_id: 'o2' };

  it('org-wide applies to everyone', () => {
    const h = mk({ id: 'h1', date: '2026-06-10', org_wide: true });
    const map = resolveHolidayDatesByStaff([staffA, staffB], [h], [], '2026-06-01', '2026-06-30');
    expect(map.get('sA')!.has('2026-06-10')).toBe(true);
    expect(map.get('sB')!.has('2026-06-10')).toBe(true);
  });

  it('branch-scoped applies only to matching outlet', () => {
    const h = mk({ id: 'h2', date: '2026-06-11', org_wide: false });
    const assigns: HolidayAssignmentRow[] = [{ holiday_id: 'h2', outlet_id: 'o1', staff_id: null }];
    const map = resolveHolidayDatesByStaff([staffA, staffB], [h], assigns, '2026-06-01', '2026-06-30');
    expect(map.get('sA')!.has('2026-06-11')).toBe(true);
    expect(map.get('sB')!.has('2026-06-11')).toBe(false);
  });

  it('staff-scoped applies only to that staff', () => {
    const h = mk({ id: 'h3', date: '2026-06-12', org_wide: false });
    const assigns: HolidayAssignmentRow[] = [{ holiday_id: 'h3', outlet_id: null, staff_id: 'sB' }];
    const set = resolveHolidayDatesForStaff(staffB, [h], assigns, '2026-06-01', '2026-06-30');
    expect(set.has('2026-06-12')).toBe(true);
    expect(resolveHolidayDatesForStaff(staffA, [h], assigns, '2026-06-01', '2026-06-30').has('2026-06-12')).toBe(false);
  });

  it('ignores optional / unpaid holidays in the off-day resolution', () => {
    const opt = mk({ id: 'o', date: '2026-06-13', type: 'optional' });
    const unpaid = mk({ id: 'u', date: '2026-06-14', is_paid: false });
    const set = resolveHolidayDatesForStaff(staffA, [opt, unpaid], [], '2026-06-01', '2026-06-30');
    expect(set.size).toBe(0);
  });
});

describe('expandHolidaysInRange', () => {
  it('lists every occurrence (any type) sorted by date', () => {
    const a = mk({ id: 'a', name: 'Republic Day', date: '2020-01-26', recurring_yearly: true });
    const b = mk({ id: 'b', name: 'Optional Fest', date: '2026-06-20', type: 'optional' });
    const occ = expandHolidaysInRange([b, a], '2026-01-01', '2026-12-31');
    expect(occ.map((o) => o.date)).toEqual(['2026-01-26', '2026-06-20']);
    expect(occ[0].holiday.name).toBe('Republic Day');
  });
});
