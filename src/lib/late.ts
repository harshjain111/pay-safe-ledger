// "Late" for a date, mirroring the discipline engine (check-absent-staff):
// late = earliest check-in later than the scheduled shift start (legacy
// staff_shift_assignments → shifts.check_in_time) by more than the grace window
// (discipline_rules.grace_minutes_in). The nightly discipline sweep only writes
// attendance_discipline_log after the fact, so this is computed live.
//
// The rule now lives in the get_attendance_overview RPC (migration
// 20260903210000) rather than here: evaluating it on the client took five
// requests across three waves, because the shift lookup needed the staff ids
// and the shift start times needed the shift ids. Read it through
// useLateForDate / useAttendanceOverview.
//
// Deliberately not kept as a second client-side implementation — two copies of
// the same rule drift, and this one is the definition the dashboard shows.

export interface LateRow {
  staff_id: string;
  employee_id: string;
  full_name: string;
  /** Rostered shift start for the date, as an instant. */
  scheduledISO: string;
  checkInISO: string;
  /** Minutes late AFTER the grace window. */
  lateMinutes: number;
}
