import { describe, it, expect } from 'vitest';
import { groupLeaveRequests } from './leave-requests';
import type { LeaveRecord } from '@/types/leave';

const rec = (over: Partial<LeaveRecord> & { id: string; leave_date: string }): LeaveRecord => ({
  staff_id: 's1',
  leave_type: 'paid',
  deduction_days: 0,
  status: 'pending',
  is_immutable: false,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...over,
}) as LeaveRecord;

describe('groupLeaveRequests', () => {
  it('collapses a multi-day request into one entry carrying every id', () => {
    const out = groupLeaveRequests([
      rec({ id: 'a', leave_date: '2026-08-12', request_group_id: 'g1' }),
      rec({ id: 'b', leave_date: '2026-08-13', request_group_id: 'g1' }),
      rec({ id: 'c', leave_date: '2026-08-14', request_group_id: 'g1' }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].ids).toEqual(['a', 'b', 'c']);
    expect(out[0].dateLabel).toBe('12 Aug – 14 Aug 2026');
    // The entry reports the FIRST day, so a queue sorted by date behaves.
    expect(out[0].leave_date).toBe('2026-08-12');
  });

  it('orders ids by date even when the rows arrive shuffled', () => {
    const out = groupLeaveRequests([
      rec({ id: 'c', leave_date: '2026-08-14', request_group_id: 'g1' }),
      rec({ id: 'a', leave_date: '2026-08-12', request_group_id: 'g1' }),
      rec({ id: 'b', leave_date: '2026-08-13', request_group_id: 'g1' }),
    ]);
    expect(out[0].ids).toEqual(['a', 'b', 'c']);
  });

  it('leaves pre-migration rows standalone rather than lumping the NULLs together', () => {
    // The bug this guards: treating request_group_id NULL as one shared key
    // would merge every legacy row in the queue into a single entry, and
    // approving one would approve them all.
    const out = groupLeaveRequests([
      rec({ id: 'x', leave_date: '2026-07-01' }),
      rec({ id: 'y', leave_date: '2026-07-02' }),
      rec({ id: 'z', leave_date: '2026-07-03', staff_id: 's2' }),
    ]);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.ids)).toEqual([['x'], ['y'], ['z']]);
    expect(out[0].dateLabel).toBe('01 Jul 2026');
  });

  it('keeps a part-decided group apart so one entry never mixes statuses', () => {
    const out = groupLeaveRequests([
      rec({ id: 'a', leave_date: '2026-08-12', request_group_id: 'g1', status: 'approved' }),
      rec({ id: 'b', leave_date: '2026-08-13', request_group_id: 'g1', status: 'pending' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.status).sort()).toEqual(['approved', 'pending']);
  });

  it('separates two different requests from the same person', () => {
    const out = groupLeaveRequests([
      rec({ id: 'a', leave_date: '2026-08-12', request_group_id: 'g1' }),
      rec({ id: 'b', leave_date: '2026-08-20', request_group_id: 'g2' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].leave_date).toBe('2026-08-12');
    expect(out[1].leave_date).toBe('2026-08-20');
  });

  it('returns nothing for nothing', () => {
    expect(groupLeaveRequests([])).toEqual([]);
  });
});
