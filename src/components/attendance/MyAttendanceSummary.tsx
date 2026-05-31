import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AttendanceSession, formatMinutes } from '@/lib/attendance';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { CheckCircle2, Clock, Coffee, AlertTriangle, CalendarMinus, TrendingUp, Loader2 } from 'lucide-react';
import { cn, toAmount } from '@/lib/utils';

interface LeaveLite {
  leave_date: string;
  deduction_days: number;
  status: string;
}

export function MyAttendanceSummary() {
  const { user, staffData } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [leaves, setLeaves] = useState<LeaveLite[]>([]);
  const [loading, setLoading] = useState(true);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
      }),
    [],
  );

  const monthStart = useMemo(() => startOfMonth(new Date(selectedMonth + '-01')), [selectedMonth]);
  const monthEnd = useMemo(() => endOfMonth(new Date(selectedMonth + '-01')), [selectedMonth]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const fromStr = format(monthStart, 'yyyy-MM-dd');
        const toStr = format(monthEnd, 'yyyy-MM-dd');

        const sessionsPromise = supabase
          .from('attendance_sessions' as never)
          .select('*')
          .eq('user_id', user!.id)
          .gte('work_date', fromStr)
          .lte('work_date', toStr)
          .order('check_in_at', { ascending: false });

        const leavesPromise = staffData?.id
          ? supabase
              .from('leave_records')
              .select('leave_date, deduction_days, status')
              .eq('staff_id', staffData.id)
              .gte('leave_date', fromStr)
              .lte('leave_date', toStr)
          : Promise.resolve({ data: [], error: null } as never);

        const [{ data: sessData, error: sErr }, { data: lvData, error: lErr }] =
          await Promise.all([sessionsPromise, leavesPromise]);
        if (sErr) throw sErr;
        if (lErr) throw lErr;
        if (cancelled) return;
        setSessions((sessData as AttendanceSession[]) ?? []);
        setLeaves((lvData as LeaveLite[]) ?? []);
      } catch (e) {
        console.error('Summary load error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, staffData?.id, monthStart, monthEnd]);

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed');
    const totalMinutes = completed.reduce((sum, s) => sum + (s.worked_minutes ?? 0), 0);
    const breakMinutes = completed.reduce((sum, s) => sum + (s.total_break_minutes ?? 0), 0);
    const lateCount = completed.filter((s) => s.late_checkout).length;
    const presentDays = new Set(completed.map((s) => s.work_date)).size;
    const leaveDays = leaves
      .filter((l) => l.status === 'approved')
      .reduce((sum, l) => sum + toAmount(l.deduction_days), 0);
    const avg = presentDays > 0 ? Math.round(totalMinutes / presentDays) : 0;
    return { presentDays, totalMinutes, breakMinutes, lateCount, leaveDays, avg };
  }, [sessions, leaves]);

  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  function dayStatus(d: Date): 'present' | 'leave' | 'absent' | 'future' {
    if (d > new Date()) return 'future';
    const ds = format(d, 'yyyy-MM-dd');
    if (sessions.some((s) => s.work_date === ds)) return 'present';
    if (leaves.some((l) => l.leave_date === ds && l.status === 'approved')) return 'leave';
    return 'absent';
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Monthly Overview</h2>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading summary…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile icon={CheckCircle2} label="Days Present" value={String(stats.presentDays)} accent="text-emerald-600" />
            <StatTile icon={Clock} label="Hours Worked" value={formatMinutes(stats.totalMinutes)} accent="text-primary" />
            <StatTile icon={TrendingUp} label="Avg / Day" value={formatMinutes(stats.avg)} accent="text-indigo-600" />
            <StatTile icon={Coffee} label="Break Total" value={formatMinutes(stats.breakMinutes)} accent="text-amber-600" />
            <StatTile icon={AlertTriangle} label="Late Outs" value={String(stats.lateCount)} accent="text-orange-600" />
            <StatTile icon={CalendarMinus} label="Leave Days" value={String(stats.leaveDays)} accent="text-rose-600" />
          </div>

          <Card className="rounded-2xl border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <div key={i} className="text-[10px] font-medium text-muted-foreground py-1">
                    {d}
                  </div>
                ))}
                {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {days.map((d) => {
                  const st = dayStatus(d);
                  const isToday = isSameDay(d, new Date());
                  return (
                    <div
                      key={d.toISOString()}
                      className={cn(
                        'aspect-square rounded-md text-xs flex items-center justify-center font-medium border',
                        st === 'present' && 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
                        st === 'leave' && 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400',
                        st === 'absent' && 'bg-muted/40 border-transparent text-muted-foreground',
                        st === 'future' && 'border-dashed border-muted text-muted-foreground/50',
                        isToday && 'ring-2 ring-primary',
                      )}
                    >
                      {format(d, 'd')}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <LegendDot color="bg-emerald-500" label="Present" />
                <LegendDot color="bg-amber-500" label="Leave" />
                <LegendDot color="bg-muted" label="Absent" />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card className="rounded-2xl border-0 shadow-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', accent)} />
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        </div>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
      {label}
    </div>
  );
}
