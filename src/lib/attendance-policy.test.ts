import { describe, it, expect } from 'vitest';
import {
  resolvePolicy,
  evaluateLateness,
  evaluateMissedPunch,
  operationWorkDate,
  DEFAULT_POLICY,
  type PolicyRow,
} from './attendance-policy';

const row = (p: Partial<PolicyRow>): PolicyRow => ({
  scope: 'global', outlet_id: null, staff_id: null,
  grace_minutes: 10, half_day_after_minutes: null, missed_punch_action: 'flag', day_start_hour: 0,
  ...p,
});

describe('resolvePolicy', () => {
  const rows = [
    row({ scope: 'global', grace_minutes: 10 }),
    row({ scope: 'outlet', outlet_id: 'O1', grace_minutes: 20 }),
    row({ scope: 'staff', staff_id: 'S1', grace_minutes: 30 }),
  ];
  it('prefers a staff override over outlet and global', () => {
    expect(resolvePolicy(rows, { staffId: 'S1', outletId: 'O1' }).grace_minutes).toBe(30);
  });
  it('falls back to the outlet policy', () => {
    expect(resolvePolicy(rows, { staffId: 'S2', outletId: 'O1' }).grace_minutes).toBe(20);
  });
  it('falls back to global', () => {
    expect(resolvePolicy(rows, { staffId: 'S2', outletId: 'O2' }).grace_minutes).toBe(10);
  });
  it('uses the built-in default when nothing matches', () => {
    expect(resolvePolicy([], {})).toEqual(DEFAULT_POLICY);
  });
  it('ignores inactive rows', () => {
    expect(resolvePolicy([row({ scope: 'staff', staff_id: 'S1', grace_minutes: 99, is_active: false })], { staffId: 'S1' }))
      .toEqual(DEFAULT_POLICY);
  });
});

describe('evaluateLateness', () => {
  const p = { ...DEFAULT_POLICY, grace_minutes: 10, half_day_after_minutes: 120 };
  it('is on time within grace', () => {
    const r = evaluateLateness('2026-07-16T09:08:00', '2026-07-16T09:00:00', p);
    expect(r.isLate).toBe(false);
    expect(r.lateMinutes).toBe(8);
  });
  it('is late beyond grace', () => {
    const r = evaluateLateness('2026-07-16T09:25:00', '2026-07-16T09:00:00', p);
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(25);
    expect(r.isHalfDay).toBe(false);
  });
  it('is a half day when very late', () => {
    const r = evaluateLateness('2026-07-16T11:30:00', '2026-07-16T09:00:00', p);
    expect(r.isHalfDay).toBe(true);
    expect(r.lateMinutes).toBe(150);
  });
  it('clamps early arrival to zero', () => {
    expect(evaluateLateness('2026-07-16T08:50:00', '2026-07-16T09:00:00', p).lateMinutes).toBe(0);
  });
});

describe('evaluateMissedPunch', () => {
  it('is fine when both punches exist', () => {
    expect(evaluateMissedPunch(true, true, DEFAULT_POLICY).missed).toBe(false);
  });
  it('cancels the day on a missing punch when policy=cancel_day', () => {
    const r = evaluateMissedPunch(true, false, { ...DEFAULT_POLICY, missed_punch_action: 'cancel_day' });
    expect(r).toMatchObject({ missed: true, dayCancelled: true, halfDay: false });
  });
  it('half-days on a missing punch when policy=half_day', () => {
    expect(evaluateMissedPunch(false, true, { ...DEFAULT_POLICY, missed_punch_action: 'half_day' }).halfDay).toBe(true);
  });
});

describe('operationWorkDate', () => {
  it('uses the calendar date when day starts at midnight', () => {
    expect(operationWorkDate('2026-07-16T23:30:00', 0)).toBe('2026-07-16');
    expect(operationWorkDate('2026-07-16T02:00:00', 0)).toBe('2026-07-16');
  });
  it('rolls a pre-dawn punch back to the previous work-day when day starts at 5am', () => {
    expect(operationWorkDate('2026-07-16T02:00:00', 5)).toBe('2026-07-15');
    expect(operationWorkDate('2026-07-16T06:00:00', 5)).toBe('2026-07-16');
  });
});
