import { describe, it, expect } from 'vitest';
import {
  reducePunches,
  minutesBetween,
  type PunchInput,
  type OpenSession,
} from '../../supabase/functions/_shared/punch-normalize';

const S = 'staff-1';
const T = 'staff-2';

function inEv(staffId: string, ts: string, workDate = '2026-06-13'): PunchInput {
  return { staffId, direction: 'in', ts, workDate };
}
function outEv(staffId: string, ts: string, workDate = '2026-06-13'): PunchInput {
  return { staffId, direction: 'out', ts, workDate };
}

describe('minutesBetween', () => {
  it('returns whole minutes between two instants', () => {
    expect(minutesBetween('2026-06-13T09:00:00Z', '2026-06-13T17:00:00Z')).toBe(480);
  });
  it('rounds to the nearest minute', () => {
    expect(minutesBetween('2026-06-13T09:00:00Z', '2026-06-13T09:00:40Z')).toBe(1);
    expect(minutesBetween('2026-06-13T09:00:00Z', '2026-06-13T09:00:20Z')).toBe(0);
  });
  it('clamps a negative interval to zero', () => {
    expect(minutesBetween('2026-06-13T17:00:00Z', '2026-06-13T09:00:00Z')).toBe(0);
  });
});

describe('reducePunches — single events', () => {
  it('an IN with no open session opens a session', () => {
    const [r] = reducePunches([inEv(S, '2026-06-13T09:00:00Z')]);
    expect(r.action.kind).toBe('open');
    if (r.action.kind === 'open') {
      expect(r.action.staffId).toBe(S);
      expect(r.action.check_in_at).toBe('2026-06-13T09:00:00Z');
      expect(r.action.work_date).toBe('2026-06-13');
    }
  });

  it('an OUT with no open session is a no-op', () => {
    const [r] = reducePunches([outEv(S, '2026-06-13T17:00:00Z')]);
    expect(r.action.kind).toBe('noop');
    if (r.action.kind === 'noop') expect(r.action.reason).toBe('no-open-session');
  });
});

describe('reducePunches — pairing', () => {
  it('IN then OUT in one batch pairs into open + close with worked_minutes', () => {
    const res = reducePunches([
      inEv(S, '2026-06-13T09:00:00Z'),
      outEv(S, '2026-06-13T17:30:00Z'),
    ]);
    expect(res.map((r) => r.action.kind)).toEqual(['open', 'close']);
    const close = res[1].action;
    const open = res[0].action;
    if (open.kind === 'open' && close.kind === 'close') {
      // The close resolves to the session the IN opened in this batch.
      expect(close.session_id).toBe(open.tempId);
      expect(close.worked_minutes).toBe(510); // 8h30m
      expect(close.check_out_at).toBe('2026-06-13T17:30:00Z');
    }
  });

  it('closes a pre-existing (seeded) open session', () => {
    const seed: Record<string, OpenSession | null> = {
      [S]: { id: 'sess-real', check_in_at: '2026-06-13T09:00:00Z', status: 'active' },
    };
    const res = reducePunches([outEv(S, '2026-06-13T18:00:00Z')], seed);
    const close = res[0].action;
    expect(close.kind).toBe('close');
    if (close.kind === 'close') {
      expect(close.session_id).toBe('sess-real');
      expect(close.worked_minutes).toBe(540); // 9h
    }
  });
});

describe('reducePunches — de-duplication', () => {
  it('a duplicate IN while already checked in is a no-op', () => {
    const res = reducePunches([
      inEv(S, '2026-06-13T09:00:00Z'),
      inEv(S, '2026-06-13T09:05:00Z'),
    ]);
    expect(res.map((r) => r.action.kind)).toEqual(['open', 'noop']);
    if (res[1].action.kind === 'noop') expect(res[1].action.reason).toBe('duplicate-in');
  });

  it('the exact same punch repeated collapses to a single open', () => {
    const dup = inEv(S, '2026-06-13T09:00:00Z');
    const res = reducePunches([dup, { ...dup }]);
    expect(res.filter((r) => r.action.kind === 'open')).toHaveLength(1);
    expect(res.filter((r) => r.action.kind === 'noop')).toHaveLength(1);
  });

  it('an already-open seeded session makes a fresh IN a no-op', () => {
    const seed: Record<string, OpenSession | null> = {
      [S]: { id: 'sess-real', check_in_at: '2026-06-13T09:00:00Z', status: 'active' },
    };
    const res = reducePunches([inEv(S, '2026-06-13T09:10:00Z')], seed);
    expect(res[0].action.kind).toBe('noop');
  });
});

describe('reducePunches — ordering & isolation', () => {
  it('processes events in chronological order regardless of array order', () => {
    // OUT supplied before IN in the array, but its ts is later.
    const res = reducePunches([
      outEv(S, '2026-06-13T17:00:00Z'),
      inEv(S, '2026-06-13T09:00:00Z'),
    ]);
    // Application order is chronological: open (09:00) then close (17:00).
    expect(res.map((r) => r.action.kind)).toEqual(['open', 'close']);
    // index is preserved so callers can map back to the original punch rows.
    expect(res[0].index).toBe(1); // the IN was element 1
    expect(res[1].index).toBe(0); // the OUT was element 0
  });

  it('keeps each staff member’s pairing independent', () => {
    const res = reducePunches([
      inEv(S, '2026-06-13T09:00:00Z'),
      outEv(T, '2026-06-13T09:30:00Z'), // T has no open session -> noop
      outEv(S, '2026-06-13T17:00:00Z'),
      inEv(T, '2026-06-13T10:00:00Z'),
    ]);
    const byStaff = (id: string) => res.filter((r) => r.input.staffId === id).map((r) => r.action.kind);
    expect(byStaff(S)).toEqual(['open', 'close']);
    expect(byStaff(T)).toEqual(['noop', 'open']); // chronological: 09:30 out (noop), 10:00 in (open)
  });
});
