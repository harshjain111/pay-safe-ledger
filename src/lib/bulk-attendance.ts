// ============================================================================
// Bulk attendance adjustments — pure change-set planner (no IO, unit-tested).
//
// Maps a bulk action over (staff × dates) into concrete write operations against
// the SAME attendance pipeline the app uses:
//   * present / half-day / absent / punches -> attendance_sessions
//   * set shift / paid off-day              -> staff_roster
// The page previews the change set, then commits the write ops and records one
// audit entry (actor + scope).
// ============================================================================

export type BulkAction = 'present' | 'half_day' | 'absent' | 'set_punches' | 'set_shift' | 'paid_off';

export interface BulkStaff {
  id: string;
  full_name: string;
  employee_id: string;
  user_id: string | null;
}

export interface CurrentSessionDay {
  status: string;
  worked: number;
  count: number;
}
export interface CurrentRosterDay {
  shift_id: string | null;
  is_off: boolean;
}

export type WriteOp =
  | {
      op: 'upsertSession';
      staffId: string;
      userId: string | null;
      date: string;
      checkInAt: string;
      checkOutAt: string;
      workedMinutes: number;
      source: string;
    }
  | { op: 'clearSessions'; staffId: string; date: string }
  | { op: 'upsertRoster'; staffId: string; date: string; shiftId: string | null; isOff: boolean };

export interface ChangeRow {
  staffId: string;
  staffName: string;
  employeeId: string;
  date: string;
  before: string;
  after: string;
  changed: boolean;
  write: WriteOp;
}

export interface PlanParams {
  shiftId?: string;
  shiftName?: string;
  inTime?: string; // HH:MM
  outTime?: string; // HH:MM
}

export interface PlanInput {
  staff: BulkStaff[];
  dates: string[]; // yyyy-MM-dd
  action: BulkAction;
  params: PlanParams;
  rules: { fullDayMinutes: number; halfDayMinutes: number };
  sessionsByStaffDate: Map<string, CurrentSessionDay>;
  rosterByStaffDate: Map<string, CurrentRosterDay>;
}

const key = (staffId: string, date: string) => `${staffId}|${date}`;
const IST = '+05:30';

export function fmtHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
}

/** Worked minutes between two HH:MM times, accounting for an overnight span. */
export function punchWorkedMinutes(inTime: string, outTime: string): number {
  const a = timeToMinutes(inTime);
  let b = timeToMinutes(outTime);
  if (b <= a) b += 24 * 60;
  return b - a;
}

function sessionWrite(staff: BulkStaff, date: string, inTime: string, worked: number): WriteOp {
  const outMin = timeToMinutes(inTime) + worked;
  const overnight = outMin >= 24 * 60;
  const outHH = Math.floor((outMin % (24 * 60)) / 60);
  const outMM = outMin % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  // Next-day checkout keeps the same work_date (matches night-shift handling).
  const checkOutDate = overnight ? addDay(date) : date;
  return {
    op: 'upsertSession',
    staffId: staff.id,
    userId: staff.user_id,
    date,
    checkInAt: `${date}T${inTime}:00${IST}`,
    checkOutAt: `${checkOutDate}T${pad(outHH)}:${pad(outMM)}:00${IST}`,
    workedMinutes: worked,
    source: 'manual',
  };
}

function addDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function sessionBefore(cur: CurrentSessionDay | undefined): string {
  if (!cur) return '—';
  if (cur.status !== 'completed') return 'In progress';
  if (cur.worked <= 0) return 'Recorded (0h)';
  return `Recorded ${fmtHM(cur.worked)}`;
}
function rosterBefore(cur: CurrentRosterDay | undefined, shiftName?: (id: string) => string): string {
  if (!cur) return '—';
  if (cur.is_off || !cur.shift_id) return 'Off';
  return `Shift ${shiftName?.(cur.shift_id) ?? ''}`.trim();
}

export function planBulkAdjustment(input: PlanInput): ChangeRow[] {
  const { staff, dates, action, params, rules, sessionsByStaffDate, rosterByStaffDate } = input;
  const rows: ChangeRow[] = [];

  for (const st of staff) {
    for (const date of dates) {
      const curSess = sessionsByStaffDate.get(key(st.id, date));
      const curRos = rosterByStaffDate.get(key(st.id, date));
      let after = '';
      let changed = false;
      let write: WriteOp;

      switch (action) {
        case 'present': {
          const worked = rules.fullDayMinutes;
          write = sessionWrite(st, date, '09:00', worked);
          after = `Present (${fmtHM(worked)})`;
          changed = !curSess || curSess.status !== 'completed' || curSess.worked !== worked || curSess.count !== 1;
          break;
        }
        case 'half_day': {
          const worked = rules.halfDayMinutes;
          write = sessionWrite(st, date, '09:00', worked);
          after = `Half day (${fmtHM(worked)})`;
          changed = !curSess || curSess.status !== 'completed' || curSess.worked !== worked || curSess.count !== 1;
          break;
        }
        case 'set_punches': {
          const inT = params.inTime ?? '09:00';
          const outT = params.outTime ?? '17:00';
          const worked = punchWorkedMinutes(inT, outT);
          write = sessionWrite(st, date, inT, worked);
          after = `${inT}–${outT} (${fmtHM(worked)})`;
          changed = !curSess || curSess.status !== 'completed' || curSess.worked !== worked || curSess.count !== 1;
          break;
        }
        case 'absent': {
          write = { op: 'clearSessions', staffId: st.id, date };
          after = 'Absent';
          changed = !!curSess;
          break;
        }
        case 'set_shift': {
          write = { op: 'upsertRoster', staffId: st.id, date, shiftId: params.shiftId ?? null, isOff: false };
          after = `Shift ${params.shiftName ?? ''}`.trim();
          changed = !curRos || curRos.shift_id !== (params.shiftId ?? null) || curRos.is_off;
          break;
        }
        case 'paid_off': {
          write = { op: 'upsertRoster', staffId: st.id, date, shiftId: null, isOff: true };
          after = 'Paid off-day';
          changed = !curRos || !curRos.is_off;
          break;
        }
      }

      const before =
        action === 'set_shift' || action === 'paid_off' ? rosterBefore(curRos) : sessionBefore(curSess);

      rows.push({
        staffId: st.id,
        staffName: st.full_name,
        employeeId: st.employee_id,
        date,
        before,
        after,
        changed,
        write,
      });
    }
  }
  return rows;
}
