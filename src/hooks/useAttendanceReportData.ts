import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  buildReportDataset,
  type AttendanceReportDataset,
  type ReportStaff,
  type ReportSession,
  type ReportRoster,
  type ReportLeave,
  type ReportShift,
  type ReportShiftAssignment,
} from '@/lib/attendance-reports';
import { resolveHolidayDatesByStaff, type HolidayRow, type HolidayAssignmentRow } from '@/lib/holidays';

export interface ReportFilterState {
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
  outletId: string; // 'all' or outlet id
  departmentId: string; // 'all' or department id
  staffId: string; // 'all' or staff id
}

interface Option {
  id: string;
  name: string;
}

const STAFF_COLS =
  'id, full_name, employee_id, department, department_id, designation, outlet_id, date_of_joining, date_of_leaving, weekly_off_day';

/**
 * Loads everything the attendance reports need for the given filters and runs
 * the pure derivation engine. The same inputs settlements use (attendance,
 * roster, approved leaves, pay rules) are gathered here — for many staff over a
 * date range rather than one staff per month.
 */
export function useAttendanceReportData(filters: ReportFilterState) {
  const [dataset, setDataset] = useState<AttendanceReportDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter-bar option lists (loaded once).
  const [outlets, setOutlets] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([]);

  const { from, to, outletId, departmentId, staffId } = filters;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Staff matching the org filters, employed during the range, tracked.
      let sq = supabase
        .from('staff')
        .select(STAFF_COLS)
        .eq('attendance_tracked', true)
        .lte('date_of_joining', to)
        .or(`date_of_leaving.is.null,date_of_leaving.gte.${from}`)
        .order('full_name');
      if (outletId !== 'all') sq = sq.eq('outlet_id', outletId);
      if (departmentId !== 'all') sq = sq.eq('department_id', departmentId);
      if (staffId !== 'all') sq = sq.eq('id', staffId);

      const { data: staffRows, error: staffErr } = await sq;
      if (staffErr) throw staffErr;
      const staff = (staffRows ?? []) as unknown as ReportStaff[];
      const staffIds = staff.map((s) => s.id);

      // Pay rules — same singleton settlements read (may be absent in live DB).
      const rulesRes = await supabase
        .from('hr_pay_rules' as never)
        .select('full_day_minutes, half_day_minutes, unscheduled_is_off')
        .maybeSingle();
      const r = (rulesRes.data ?? null) as {
        full_day_minutes?: number;
        half_day_minutes?: number;
        unscheduled_is_off?: boolean;
      } | null;
      const rules = {
        fullDayMinutes: r?.full_day_minutes ?? 480,
        halfDayMinutes: r?.half_day_minutes ?? 240,
        unscheduledIsOff: r?.unscheduled_is_off ?? true,
      };

      const outletRows = await supabase.from('outlets').select('id, name');
      const outletList = (outletRows.data ?? []) as Option[];

      if (staffIds.length === 0) {
        setDataset(
          buildReportDataset({
            from, to, staff: [], sessions: [], roster: [], leaves: [], shifts: [], assignments: [],
            rules, outlets: outletList,
          }),
        );
        return;
      }

      // 2) Related data for those staff over the range.
      const [sessRes, rosRes, lvRes, shiftRes, assignRes, holRes, holAssignRes] = await Promise.all([
        supabase
          .from('attendance_sessions')
          .select('staff_id, work_date, worked_minutes, status, check_in_at, check_out_at, source')
          .in('staff_id', staffIds)
          .gte('work_date', from)
          .lte('work_date', to),
        supabase
          .from('staff_roster')
          .select('staff_id, roster_date, shift_id, is_off')
          .in('staff_id', staffIds)
          .gte('roster_date', from)
          .lte('roster_date', to),
        supabase
          .from('leave_records')
          .select('staff_id, leave_date, deduction_days, status, leave_type')
          .in('staff_id', staffIds)
          .eq('status', 'approved')
          .gte('leave_date', from)
          .lte('leave_date', to),
        supabase.from('shifts').select('id, name, check_in_time, check_out_time'),
        supabase.from('staff_shift_assignments').select('staff_id, shift_id, effective_from').in('staff_id', staffIds),
        supabase.from('holidays').select('id, name, date, type, is_paid, recurring_yearly, org_wide'),
        supabase.from('holiday_assignments').select('holiday_id, outlet_id, staff_id'),
      ]);

      for (const res of [sessRes, rosRes, lvRes, shiftRes, assignRes, holRes, holAssignRes]) {
        if (res.error) throw res.error;
      }

      const holidayDatesByStaff = resolveHolidayDatesByStaff(
        staff.map((s) => ({ id: s.id, outlet_id: s.outlet_id })),
        (holRes.data ?? []) as unknown as HolidayRow[],
        (holAssignRes.data ?? []) as unknown as HolidayAssignmentRow[],
        from, to,
      );

      setDataset(
        buildReportDataset({
          from, to, staff,
          sessions: (sessRes.data ?? []) as unknown as ReportSession[],
          roster: (rosRes.data ?? []) as unknown as ReportRoster[],
          leaves: (lvRes.data ?? []) as unknown as ReportLeave[],
          shifts: (shiftRes.data ?? []) as unknown as ReportShift[],
          assignments: (assignRes.data ?? []) as unknown as ReportShiftAssignment[],
          rules,
          outlets: outletList,
          holidayDatesByStaff,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report data');
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, outletId, departmentId, staffId]);

  useEffect(() => {
    load();
  }, [load]);

  // Option lists for the filter bar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [o, d, s] = await Promise.all([
        supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
        supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
        supabase.from('staff').select('id, full_name').eq('attendance_tracked', true).order('full_name'),
      ]);
      if (cancelled) return;
      setOutlets((o.data ?? []) as Option[]);
      setDepartments((d.data ?? []) as Option[]);
      setStaffList((s.data ?? []) as { id: string; full_name: string }[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { dataset, loading, error, reload: load, outlets, departments, staffList };
}
