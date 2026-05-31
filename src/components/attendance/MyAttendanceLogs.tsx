import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttendanceSession, formatMinutes, formatSessionTime } from '@/lib/attendance';
import { SessionDetailsDrawer } from './SessionDetailsDrawer';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { CalendarClock, Loader2, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/layout/EmptyState';

export function MyAttendanceLogs() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [filter, setFilter] = useState<'all' | 'completed' | 'late'>('all');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AttendanceSession | null>(null);
  const [open, setOpen] = useState(false);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const monthStart = startOfMonth(new Date(selectedMonth + '-01'));
        const monthEnd = endOfMonth(new Date(selectedMonth + '-01'));
        const { data, error } = await supabase
          .from('attendance_sessions' as never)
          .select('*')
          .eq('user_id', user!.id)
          .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
          .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))
          .order('check_in_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) setSessions((data as AttendanceSession[]) ?? []);
      } catch (e) {
        console.error('Logs load error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, selectedMonth]);

  const filtered = useMemo(() => {
    if (filter === 'completed') return sessions.filter((s) => s.status === 'completed');
    if (filter === 'late') return sessions.filter((s) => s.late_checkout);
    return sessions;
  }, [sessions, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-base font-semibold">Daily Logs</h2>
        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-40 h-9">
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
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="late">Late Checkout</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading logs…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No sessions"
              description="You have no attendance records for this period."
            />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelected(s);
                      setOpen(true);
                    }}
                    className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/40"
                  >
                    <div>
                      <p className="font-medium">{format(new Date(s.work_date), 'EEE, dd MMM')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatSessionTime(s.check_in_at, s.work_date)} –{' '}
                        {s.check_out_at ? formatSessionTime(s.check_out_at, s.work_date) : 'ongoing'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Worked {formatMinutes(s.worked_minutes)}
                        {s.total_break_minutes > 0 && ` · Break ${formatMinutes(s.total_break_minutes)}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={s.status === 'completed' ? 'secondary' : 'default'}>{s.status}</Badge>
                      {s.late_checkout && (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Late
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Worked</TableHead>
                      <TableHead>Break</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => {
                          setSelected(s);
                          setOpen(true);
                        }}
                      >
                        <TableCell>
                          <div className="font-medium">{format(new Date(s.work_date), 'dd MMM')}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(s.work_date), 'EEEE')}
                          </div>
                        </TableCell>
                        <TableCell>{formatSessionTime(s.check_in_at, s.work_date)}</TableCell>
                        <TableCell>
                          {s.check_out_at ? formatSessionTime(s.check_out_at, s.work_date) : '—'}
                        </TableCell>
                        <TableCell className="font-medium">{formatMinutes(s.worked_minutes)}</TableCell>
                        <TableCell>{formatMinutes(s.total_break_minutes)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={s.status === 'completed' ? 'secondary' : 'default'}>
                              {s.status}
                            </Badge>
                            {s.late_checkout && (
                              <Badge variant="destructive" className="text-[10px]">
                                Late
                              </Badge>
                            )}
                            {s.auto_closed && (
                              <Badge variant="outline" className="text-[10px]">
                                Auto-closed
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SessionDetailsDrawer open={open} onOpenChange={setOpen} session={selected} />
    </div>
  );
}
