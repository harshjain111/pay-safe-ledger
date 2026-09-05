import { describe, it, expect } from 'vitest';
import { computeDayBreakdown } from './attendance-pay';

// ---------------------------------------------------------------------------
// Weekly-off carry forward.
//
// The weekly off is a monthly QUOTA, not fixed dates: an employee whose off day
// is Tuesday gets as many paid offs as there are Tuesdays that month and may
// take them on any day. Normally the leftover lapses. For designations flagged
// weekly_off_carry_forward (valets), it rolls into the next month instead —
// no cap, no expiry.
//
// September 2026: Tuesdays fall on the 1st, 8th, 15th, 22nd and 29th — five of
// them, which is also the case the client raised (a month with five Mondays
// gives five offs, not four).
// ---------------------------------------------------------------------------

const SEPT_START = new Date(2026, 8, 1);
const SEPT_END = new Date(2026, 8, 30);
const TUESDAY = 2;

/** Attendance for every day in the range except `skip`. */
const workedExcept = (skip: string[]) => {
  const out: { work_date: string; worked_minutes: number; status: string }[] = [];
  for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, '0')}`;
    if (skip.includes(date)) continue;
    out.push({ work_date: date, worked_minutes: 480, status: 'completed' });
  }
  return out;
};

const run = (opts: { skip: string[]; carried?: number }) =>
  computeDayBreakdown({
    monthStart: SEPT_START,
    monthEnd: SEPT_END,
    dateOfJoining: '2020-01-01',
    weeklyOffDay: TUESDAY,
    fullDayMinutes: 480,
    halfDayMinutes: 240,
    // The quota only engages when unscheduled days are NOT auto-paid.
    unscheduledIsOff: false,
    carriedOffDays: opts.carried,
    attendance: workedExcept(opts.skip),
    roster: [],
    leaves: [],
  });

describe('weekly-off quota', () => {
  it('gives one off per occurrence of the assigned weekday — five Tuesdays, five offs', () => {
    const bd = run({ skip: [] });
    expect(bd.offQuota).toBe(5);
  });

  it('pays days taken off up to the quota, whichever days they are', () => {
    // Took Thursday and Friday off instead of any Tuesday.
    const bd = run({ skip: ['2026-09-03', '2026-09-04'] });
    expect(bd.offDays).toBe(2);
    expect(bd.absentDays).toBe(0);
    expect(bd.offUnused).toBe(3);
  });

  it('docks days taken beyond the quota as absent', () => {
    const bd = run({ skip: ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-09', '2026-09-10', '2026-09-11'] });
    expect(bd.offDays).toBe(5);
    expect(bd.absentDays).toBe(1);
    expect(bd.offUnused).toBe(0);
  });

  it('working the whole month leaves the entire quota unused', () => {
    const bd = run({ skip: [] });
    expect(bd.offDays).toBe(0);
    expect(bd.absentDays).toBe(0);
    expect(bd.offUnused).toBe(5);
  });
});

describe('carry forward', () => {
  it('spends brought-forward days exactly like the month’s own', () => {
    // 5 banked + 5 this month = 10 available; takes 8, so 8 paid and none absent.
    const skip = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07',
                  '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14'];
    const bd = run({ skip, carried: 5 });
    expect(bd.offDays).toBe(8);
    expect(bd.absentDays).toBe(0);
    expect(bd.offCarriedIn).toBe(5);
    expect(bd.offUnused).toBe(2);
  });

  it('is what lets a valet work a month then take the days together', () => {
    // Month 1: worked every day, banks the lot.
    const month1 = run({ skip: [] });
    expect(month1.offUnused).toBe(5);

    // Month 2: carries those in and takes 9 days off in one block. Without the
    // carry-forward only 5 would be paid and 4 would be docked.
    const block = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
                   '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'];
    const month2 = run({ skip: block, carried: month1.offUnused });
    expect(month2.offDays).toBe(9);
    expect(month2.absentDays).toBe(0);

    const withoutCarry = run({ skip: block });
    expect(withoutCarry.offDays).toBe(5);
    expect(withoutCarry.absentDays).toBe(4);
  });

  it('lapses for everyone else — no carried days means the old behaviour', () => {
    const bd = run({ skip: ['2026-09-07'] });
    expect(bd.offCarriedIn).toBe(0);
    expect(bd.offDays).toBe(1);
  });

  it('never goes negative when more is taken than is banked', () => {
    const skip = Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 2).padStart(2, '0')}`);
    const bd = run({ skip, carried: 2 });
    expect(bd.offUnused).toBe(0);
    expect(bd.offDays).toBe(7); // 5 quota + 2 carried
    expect(bd.absentDays).toBe(5);
  });
});
