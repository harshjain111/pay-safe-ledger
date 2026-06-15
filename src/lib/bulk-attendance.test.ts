import { describe, it, expect } from 'vitest';
import {
  planBulkAdjustment,
  punchWorkedMinutes,
  type BulkStaff,
  type CurrentSessionDay,
  type CurrentRosterDay,
  type PlanInput,
} from './bulk-attendance';

const staff: BulkStaff[] = [
  { id: 's1', full_name: 'Asha', employee_id: 'E1', user_id: 'u1' },
  { id: 's2', full_name: 'Bilal', employee_id: 'E2', user_id: null },
];
const rules = { fullDayMinutes: 480, halfDayMinutes: 240 };

function build(
  action: PlanInput['action'],
  params: PlanInput['params'] = {},
  sessions: Array<[string, CurrentSessionDay]> = [],
  roster: Array<[string, CurrentRosterDay]> = [],
  dates = ['2026-06-10'],
) {
  return planBulkAdjustment({
    staff, dates, action, params, rules,
    sessionsByStaffDate: new Map(sessions),
    rosterByStaffDate: new Map(roster),
  });
}

describe('punchWorkedMinutes', () => {
  it('computes a normal span', () => expect(punchWorkedMinutes('09:00', '17:30')).toBe(510));
  it('handles overnight', () => expect(punchWorkedMinutes('22:00', '06:00')).toBe(480));
});

describe('planBulkAdjustment — sessions', () => {
  it('present writes a completed full-day session', () => {
    const rows = build('present');
    expect(rows).toHaveLength(2); // 2 staff × 1 date
    const r = rows[0];
    expect(r.write.op).toBe('upsertSession');
    if (r.write.op === 'upsertSession') {
      expect(r.write.workedMinutes).toBe(480);
      expect(r.write.source).toBe('manual');
      expect(r.write.userId).toBe('u1');
    }
    expect(r.after).toBe('Present (8h)');
    expect(r.changed).toBe(true);
  });

  it('half-day uses the half-day minutes', () => {
    const r = build('half_day')[0];
    if (r.write.op === 'upsertSession') expect(r.write.workedMinutes).toBe(240);
    expect(r.after).toBe('Half day (4h)');
  });

  it('set_punches computes worked minutes from in/out', () => {
    const r = build('set_punches', { inTime: '10:00', outTime: '15:00' })[0];
    if (r.write.op === 'upsertSession') expect(r.write.workedMinutes).toBe(300);
    expect(r.after).toBe('10:00–15:00 (5h)');
  });

  it('absent clears the day and is a no-op when nothing exists', () => {
    const none = build('absent')[0];
    expect(none.write.op).toBe('clearSessions');
    expect(none.changed).toBe(false); // nothing to clear

    const withSession = build('absent', {}, [['s1|2026-06-10', { status: 'completed', worked: 480, count: 1 }]])[0];
    expect(withSession.changed).toBe(true);
  });

  it('present is a no-op when the day is already a full present session', () => {
    const r = build('present', {}, [['s1|2026-06-10', { status: 'completed', worked: 480, count: 1 }]])[0];
    expect(r.changed).toBe(false);
  });
});

describe('planBulkAdjustment — roster', () => {
  it('set_shift writes a roster shift', () => {
    const r = build('set_shift', { shiftId: 'shiftA', shiftName: 'General' })[0];
    expect(r.write.op).toBe('upsertRoster');
    if (r.write.op === 'upsertRoster') {
      expect(r.write.shiftId).toBe('shiftA');
      expect(r.write.isOff).toBe(false);
    }
    expect(r.after).toBe('Shift General');
    expect(r.changed).toBe(true);
  });

  it('paid_off writes an off roster day', () => {
    const r = build('paid_off')[0];
    if (r.write.op === 'upsertRoster') expect(r.write.isOff).toBe(true);
    expect(r.after).toBe('Paid off-day');
  });

  it('paid_off is a no-op when the day is already off', () => {
    const r = build('paid_off', {}, [], [['s1|2026-06-10', { shift_id: null, is_off: true }]])[0];
    expect(r.changed).toBe(false);
  });
});

describe('planBulkAdjustment — grid', () => {
  it('produces one row per staff per date', () => {
    const rows = build('present', {}, [], [], ['2026-06-10', '2026-06-11', '2026-06-12']);
    expect(rows).toHaveLength(2 * 3);
  });
});
