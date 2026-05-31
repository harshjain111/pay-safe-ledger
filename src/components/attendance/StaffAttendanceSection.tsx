import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AttendanceSession, formatMinutes, formatSessionTime } from '@/lib/attendance';
import { SessionDetailsDrawer } from './SessionDetailsDrawer';
import { format } from 'date-fns';
import { CalendarClock, Loader2 } from 'lucide-react';

interface Props {
  staffId: string;
}

export function StaffAttendanceSection({ staffId }: Props) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AttendanceSession | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const fromStr = format(sixtyDaysAgo, 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('attendance_sessions' as never)
          .select('*')
          .eq('staff_id', staffId)
          .gte('work_date', fromStr)
          .order('check_in_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) setSessions((data as AttendanceSession[]) ?? []);
      } catch (e) {
        console.error('Staff attendance load error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  return (
    <Card className="rounded-2xl border-0 shadow-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <CardTitle>Attendance</CardTitle>
        </div>
        <CardDescription>Last 60 days</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No attendance records yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 30).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelected(s);
                  setOpen(true);
                }}
                className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">
                    {format(new Date(s.work_date), 'EEE, dd MMM yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSessionTime(s.check_in_at, s.work_date)} –{' '}
                    {s.check_out_at ? formatSessionTime(s.check_out_at, s.work_date) : 'ongoing'}
                    {' · '}
                    Worked: {formatMinutes(s.worked_minutes)}
                    {s.total_break_minutes > 0 && ` · Break: ${formatMinutes(s.total_break_minutes)}`}
                  </p>
                </div>
                <Badge
                  variant={
                    s.status === 'completed'
                      ? 'secondary'
                      : s.status === 'on_break'
                      ? 'outline'
                      : 'default'
                  }
                >
                  {s.status}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
      <SessionDetailsDrawer open={open} onOpenChange={setOpen} session={selected} />
    </Card>
  );
}
