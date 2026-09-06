import { format, parseISO } from 'date-fns';
import type { LeaveRecord } from '@/types/leave';

// ---------------------------------------------------------------------------
// A leave request is one decision, not one per day.
//
// CreateLeaveDialog expands a picked date range into one leave_records row per
// day — right for pay, which is computed per day — and stamps them all with a
// shared request_group_id. This turns those rows back into the single request
// the employee actually submitted, so an approver meets a five-day request
// once instead of five times, chooses the leave type once, and cannot approve
// Monday while rejecting Tuesday without meaning to.
//
// Rows written before request_group_id existed carry none. Those stay
// standalone, keyed by their own id, which is correct for them.
// ---------------------------------------------------------------------------

export interface LeaveRequestGroup extends LeaveRecord {
  /** Every leave_records id this entry stands for, in date order. */
  ids: string[];
  /** "12 Aug 2026", or "12 – 16 Aug 2026" for a range. */
  dateLabel: string;
}

export function groupLeaveRequests(records: LeaveRecord[]): LeaveRequestGroup[] {
  const groups = new Map<string, LeaveRecord[]>();

  for (const r of records) {
    // Status is part of the key: a partly-decided older group must not merge
    // an approved day and a pending one into one contradictory entry.
    const key = r.request_group_id ? `g:${r.request_group_id}:${r.status}` : `r:${r.id}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  return [...groups.values()]
    .map((rows) => {
      const sorted = [...rows].sort((a, b) => a.leave_date.localeCompare(b.leave_date));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      return {
        ...first,
        ids: sorted.map((r) => r.id),
        dateLabel:
          sorted.length === 1
            ? format(parseISO(first.leave_date), 'dd MMM yyyy')
            : `${format(parseISO(first.leave_date), 'dd MMM')} – ${format(parseISO(last.leave_date), 'dd MMM yyyy')}`,
      };
    })
    // Keep the queue in date order after grouping.
    .sort((a, b) => a.leave_date.localeCompare(b.leave_date));
}
