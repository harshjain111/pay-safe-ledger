import { describe, it, expect } from 'vitest';
import {
  computeWorkedMinutes, scoreDay, configForDate, nextEffectiveFrom,
  resolveWorking, inferShift, shouldAutoPromote, autoPromoteEntry, shouldReverseAutoEntry,
  projectTemplate,
  type WorkingHourConfig, type ConfigHistoryRow, type RosterEntry,
} from './shift-roster';

const cfg = (over: Partial<WorkingHourConfig> = {}): WorkingHourConfig => ({
  full_day_minutes: 360, // 06:00
  half_day_minutes: 240, // 04:00
  attendance_mode: 'ALL_PUNCH',
  ...over,
});
const D = '2026-06-15';
const at = (hhmm: string) => `${D}T${hhmm}:00Z`;

describe('§1.3 worked minutes', () => {
  it('ALL_PUNCH sums every in→out pair', () => {
    expect(computeWorkedMinutes([{ in: at('09:00'), out: at('12:00') }, { in: at('13:00'), out: at('17:00') }], 'ALL_PUNCH')).toBe(420);
  });
  it('FIRST_LAST_ONLY spans first-in to last-out (ignores the break)', () => {
    expect(computeWorkedMinutes([{ in: at('09:00'), out: at('12:00') }, { in: at('13:00'), out: at('17:00') }], 'FIRST_LAST_ONLY')).toBe(480);
  });
  it('a punch with no check-out contributes 0 under ALL_PUNCH', () => {
    expect(computeWorkedMinutes([{ in: at('09:00') }], 'ALL_PUNCH')).toBe(0);
  });
});

describe('§1.3 scoring (Full / Half / Absent)', () => {
  it('no punches ⇒ ABSENT', () => {
    expect(scoreDay([], cfg())).toBe('ABSENT');
  });
  it('worked ≥ full ⇒ FULL', () => {
    expect(scoreDay([{ in: at('09:00'), out: at('17:00') }], cfg())).toBe('FULL'); // 480 ≥ 360
  });
  it('half ≤ worked < full ⇒ HALF', () => {
    expect(scoreDay([{ in: at('09:00'), out: at('14:00') }], cfg())).toBe('HALF'); // 300
  });
  it('worked < half ⇒ ABSENT', () => {
    expect(scoreDay([{ in: at('09:00'), out: at('11:00') }], cfg())).toBe('ABSENT'); // 120
  });
  it('DEFAULT_FULL ⇒ any presence is FULL regardless of hours', () => {
    expect(scoreDay([{ in: at('09:00'), out: at('09:30') }], cfg({ attendance_mode: 'DEFAULT_FULL' }))).toBe('FULL');
  });
  it('SINGLE_PUNCH_FULL ⇒ a lone check-in is FULL, but real pairs score by hours', () => {
    const c = cfg({ attendance_mode: 'SINGLE_PUNCH_FULL' });
    expect(scoreDay([{ in: at('09:00') }], c)).toBe('FULL');
    expect(scoreDay([{ in: at('09:00'), out: at('11:00') }], c)).toBe('ABSENT'); // 120 < half
  });
});

describe('working-hour config effective-dating', () => {
  const hist: ConfigHistoryRow[] = [
    { effective_from: '2000-01-01', full_day_minutes: 480, half_day_minutes: 240, attendance_mode: 'ALL_PUNCH' },
    { effective_from: '2026-06-16', full_day_minutes: 360, half_day_minutes: 180, attendance_mode: 'FIRST_LAST_ONLY' },
  ];
  it('picks the latest config effective on or before the date', () => {
    expect(configForDate(hist, '2026-06-15')?.full_day_minutes).toBe(480);
    expect(configForDate(hist, '2026-06-16')?.full_day_minutes).toBe(360);
  });
  it('a change saved today takes effect the next day', () => {
    expect(nextEffectiveFrom('2026-06-15')).toBe('2026-06-16');
  });
});

describe('§7 roster resolution', () => {
  it('SCHEDULED / AUTO_PRESENT are working; OFF and missing are not', () => {
    expect(resolveWorking({ shift_id: 's1', status: 'SCHEDULED', source: 'TEMPLATE' })).toMatchObject({ working: true, shiftId: 's1' });
    expect(resolveWorking({ shift_id: null, status: 'AUTO_PRESENT', source: 'AUTO_CHECKIN' })).toMatchObject({ working: true, shiftId: null, reason: 'AUTO_PRESENT' });
    expect(resolveWorking({ shift_id: null, status: 'OFF', source: 'TEMPLATE' })).toMatchObject({ working: false, reason: 'OFF' });
    expect(resolveWorking(null)).toMatchObject({ working: false, reason: 'NOT_SCHEDULED' });
  });
});

describe('§7.3 infer_shift + auto-promote', () => {
  const assignment = new Map<number, string | null>([[1, 'mon-shift']]); // Mon assigned
  it('infer_shift uses the weekday assignment, else Open Shift (null)', () => {
    expect(inferShift(assignment, 1)).toBe('mon-shift');
    expect(inferShift(assignment, 2)).toBeNull(); // unassigned ⇒ Open
  });
  it('auto-promotes only when there is no entry or it is OFF', () => {
    expect(shouldAutoPromote(null)).toBe(true);
    expect(shouldAutoPromote({ shift_id: null, status: 'OFF', source: 'TEMPLATE' })).toBe(true);
    expect(shouldAutoPromote({ shift_id: 's1', status: 'SCHEDULED', source: 'TEMPLATE' })).toBe(false);
    expect(shouldAutoPromote({ shift_id: null, status: 'AUTO_PRESENT', source: 'AUTO_CHECKIN' })).toBe(false);
  });
  it('autoPromoteEntry stamps AUTO_PRESENT / AUTO_CHECKIN with the inferred shift', () => {
    expect(autoPromoteEntry('mon-shift')).toEqual({ shift_id: 'mon-shift', status: 'AUTO_PRESENT', source: 'AUTO_CHECKIN' });
    expect(autoPromoteEntry(null)).toEqual({ shift_id: null, status: 'AUTO_PRESENT', source: 'AUTO_CHECKIN' });
  });
});

describe('§7.4 reversal', () => {
  const auto: RosterEntry = { shift_id: null, status: 'AUTO_PRESENT', source: 'AUTO_CHECKIN' };
  it('removes an auto-added entry only when no punches remain', () => {
    expect(shouldReverseAutoEntry(auto, false)).toBe(true);
    expect(shouldReverseAutoEntry(auto, true)).toBe(false);
  });
  it('never removes a planned OFF or a manual/template entry', () => {
    expect(shouldReverseAutoEntry({ shift_id: null, status: 'OFF', source: 'TEMPLATE' }, false)).toBe(false);
    expect(shouldReverseAutoEntry({ shift_id: 's1', status: 'SCHEDULED', source: 'MANUAL' }, false)).toBe(false);
  });
});

describe('weekly template projection', () => {
  it('week-off ⇒ explicit OFF row; assignment ⇒ SCHEDULED; neither ⇒ null (sparse)', () => {
    const assignment = new Map<number, string | null>([[1, 's1']]);
    const weekoff = new Map<number, 'WORKING' | 'WEEK_OFF' | 'OCCASIONAL_WEEK_OFF'>([[0, 'WEEK_OFF']]);
    expect(projectTemplate(0, assignment, weekoff)).toEqual({ status: 'OFF', shiftId: null, source: 'TEMPLATE' });
    expect(projectTemplate(1, assignment, weekoff)).toEqual({ status: 'SCHEDULED', shiftId: 's1', source: 'TEMPLATE' });
    expect(projectTemplate(2, assignment, weekoff)).toBeNull();
  });
});
