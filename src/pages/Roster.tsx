import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Loader2, CalendarDays, ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/layout/EmptyState';
import { toast } from '@/lib/toast';
import { resolveHolidayDatesByStaff, expandHolidaysInRange, type HolidayRow, type HolidayAssignmentRow } from '@/lib/holidays';
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
} from 'date-fns';

interface StaffRow {
  id: string;
  full_name: string;
  employee_id: string;
  weekly_off_day: number | null;
  outlet_id: string | null;
}
interface Shift {
  id: string;
  name: string;
}
interface RosterRow {
  staff_id: string;
  roster_date: string;
  shift_id: string | null;
  is_off: boolean;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Roster() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [monthDate, setMonthDate] = useState<Date>(() => startOfMonth(new Date()));
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roster, setRoster] = useState<Record<string, RosterRow>>({});
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [holAssignments, setHolAssignments] = useState<HolidayAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ staffId: string; staffName: string; date: string } | null>(null);

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) }),
    [monthDate],
  );

  const monthStartStr = useMemo(() => format(startOfMonth(monthDate), 'yyyy-MM-dd'), [monthDate]);
  const monthEndStr = useMemo(() => format(endOfMonth(monthDate), 'yyyy-MM-dd'), [monthDate]);

  // Mandatory paid holiday dates per staff (these are the paid off days).
  const holidayDatesByStaff = useMemo(
    () =>
      resolveHolidayDatesByStaff(
        staff.map((s) => ({ id: s.id, outlet_id: s.outlet_id })),
        holidays,
        holAssignments,
        monthStartStr,
        monthEndStr,
      ),
    [staff, holidays, holAssignments, monthStartStr, monthEndStr],
  );
  // Org-wide holidays tint the whole column header.
  const headerHolidayName = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of expandHolidaysInRange(holidays.filter((h) => h.org_wide), monthStartStr, monthEndStr)) {
      if (!m.has(o.date)) m.set(o.date, o.holiday.name);
    }
    return m;
  }, [holidays, monthStartStr, monthEndStr]);

  const cellKey = (staffId: string, date: string) => `${staffId}_${date}`;

  const load = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const end = format(endOfMonth(monthDate), 'yyyy-MM-dd');
    const [{ data: staffRows }, { data: shiftRows }, { data: rosterRows }, { data: holRows }, { data: holAssignRows }] = await Promise.all([
      supabase
        .from('staff')
        .select('id, full_name, employee_id, weekly_off_day, outlet_id')
        .eq('is_active', true)
        .eq('attendance_tracked', true)
        .order('full_name'),
      supabase.from('shifts').select('id, name').eq('is_active', true).order('name'),
      supabase
        .from('staff_roster')
        .select('staff_id, roster_date, shift_id, is_off')
        .gte('roster_date', start)
        .lte('roster_date', end),
      supabase.from('holidays').select('id, name, date, type, is_paid, recurring_yearly, org_wide'),
      supabase.from('holiday_assignments').select('holiday_id, outlet_id, staff_id'),
    ]);
    setStaff((staffRows as StaffRow[]) || []);
    setShifts((shiftRows as Shift[]) || []);
    setHolidays((holRows as unknown as HolidayRow[]) || []);
    setHolAssignments((holAssignRows as unknown as HolidayAssignmentRow[]) || []);
    const map: Record<string, RosterRow> = {};
    (rosterRows as RosterRow[] | null)?.forEach((r) => {
      map[`${r.staff_id}_${r.roster_date}`] = r;
    });
    setRoster(map);
    setLoading(false);
  }, [monthDate]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const setCell = async (
    staffId: string,
    date: string,
    value: { type: 'shift'; shiftId: string } | { type: 'off' } | { type: 'clear' },
  ) => {
    const key = cellKey(staffId, date);
    // Clearing a cell that has no row is a no-op — just close the dialog.
    if (value.type === 'clear' && !roster[key]) {
      setEditing(null);
      return;
    }
    setSavingKeys((prev) => new Set(prev).add(key));
    try {
      if (value.type === 'clear') {
        const { error } = await supabase
          .from('staff_roster')
          .delete()
          .eq('staff_id', staffId)
          .eq('roster_date', date);
        if (error) throw error;
        setRoster((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        const payload: RosterRow = {
          staff_id: staffId,
          roster_date: date,
          shift_id: value.type === 'shift' ? value.shiftId : null,
          is_off: value.type === 'off',
        };
        const { error } = await supabase
          .from('staff_roster')
          .upsert(payload, { onConflict: 'staff_id,roster_date' });
        if (error) throw error;
        setRoster((prev) => ({ ...prev, [key]: payload }));
      }
      setEditing(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update roster');
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  if (!canManage) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access Denied"
        description="Only owners and admins can manage the duty roster."
      />
    );
  }

  const today = new Date();

  const cellContent = (s: StaffRow, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const row = roster[cellKey(s.id, dateStr)];
    const isDefaultOff = s.weekly_off_day != null && getDay(date) === s.weekly_off_day;

    if (row) {
      if (row.is_off) return { label: 'Off', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' };
      const shift = shifts.find((x) => x.id === row.shift_id);
      return { label: shift?.name ?? '—', cls: 'bg-primary/10 text-primary' };
    }
    if (holidayDatesByStaff.get(s.id)?.has(dateStr)) {
      return { label: 'Holiday', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' };
    }
    if (isDefaultOff) return { label: 'Off', cls: 'bg-muted text-muted-foreground' };
    return { label: '·', cls: 'text-muted-foreground/50' };
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Duty Roster" description="Assign each staff member a shift or off day, day by day.">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonthDate((d) => startOfMonth(addMonths(d, -1)))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[9rem] text-center text-sm font-medium">{format(monthDate, 'MMMM yyyy')}</div>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonthDate((d) => startOfMonth(addMonths(d, 1)))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : staff.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No attendance-tracked staff found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[10rem] border-b bg-card p-2 text-left font-medium">
                      Staff
                    </th>
                    {days.map((d) => {
                      const weekend = getDay(d) === 0;
                      const holName = headerHolidayName.get(format(d, 'yyyy-MM-dd'));
                      return (
                        <th
                          key={d.toISOString()}
                          title={holName ?? undefined}
                          className={`border-b p-1 text-center font-medium ${weekend ? 'text-amber-600' : ''} ${
                            holName ? 'bg-violet-100 dark:bg-violet-500/20' : isSameDay(d, today) ? 'bg-primary/10' : ''
                          }`}
                        >
                          <div>{format(d, 'd')}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">{holName ? 'Hol' : DOW[getDay(d)]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="sticky left-0 z-10 border-b bg-card p-2">
                        <div className="font-medium">{s.full_name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.employee_id}</div>
                      </td>
                      {days.map((d) => {
                        const dateStr = format(d, 'yyyy-MM-dd');
                        const { label, cls } = cellContent(s, d);
                        const key = cellKey(s.id, dateStr);
                        return (
                          <td key={dateStr} className="border-b p-0.5 text-center">
                            <button
                              type="button"
                              onClick={() => setEditing({ staffId: s.id, staffName: s.full_name, date: dateStr })}
                              className={`h-8 w-full min-w-[2.5rem] rounded px-1 text-[10px] font-medium leading-tight transition hover:ring-1 hover:ring-primary ${cls}`}
                              title={`${s.full_name} — ${format(d, 'PPP')}`}
                            >
                              {savingKeys.has(key) ? '…' : label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: a faint “Off” is the staff member’s weekly-off default; click any cell to override it with a shift or an explicit off day.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing?.staffName}</DialogTitle>
            <DialogDescription>
              {editing ? format(new Date(editing.date), 'EEEE, PPP') : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Assign shift</p>
            <div className="grid grid-cols-2 gap-2">
              {shifts.map((sh) => (
                <Button
                  key={sh.id}
                  variant="outline"
                  size="sm"
                  onClick={() => editing && setCell(editing.staffId, editing.date, { type: 'shift', shiftId: sh.id })}
                >
                  {sh.name}
                </Button>
              ))}
              {shifts.length === 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  No shifts defined yet. Add shifts under Shifts first.
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => editing && setCell(editing.staffId, editing.date, { type: 'off' })}
              >
                Mark Off
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => editing && setCell(editing.staffId, editing.date, { type: 'clear' })}
              >
                Clear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
