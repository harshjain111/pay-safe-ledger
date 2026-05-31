import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, LogIn, LogOut, Coffee, Play, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentAttendanceSession } from '@/hooks/useCurrentAttendanceSession';
import { CaptureDialog } from './CaptureDialog';
import {
  CapturePayload,
  checkIn,
  checkOut,
  endBreak,
  formatMinutes,
  getSessionBreaks,
  startBreak,
} from '@/lib/attendance';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

function useTick(intervalMs = 1000): number {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}

function formatElapsed(fromIso: string, now: number): string {
  const ms = now - new Date(fromIso).getTime();
  if (ms < 0) return '0:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AttendanceWidget() {
  const { user, staffData } = useAuth();
  const { session, todayCompleted, isLoading, refresh } = useCurrentAttendanceSession(user?.id);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [breakLoading, setBreakLoading] = useState(false);
  const [activeBreakStart, setActiveBreakStart] = useState<string | null>(null);
  const tick = useTick(1000);

  // When status is on_break, fetch the open break to show timer
  useEffect(() => {
    let cancelled = false;
    async function loadBreak() {
      if (session?.status === 'on_break') {
        const breaks = await getSessionBreaks(session.id);
        const open = breaks.find((b) => !b.end_at);
        if (!cancelled) setActiveBreakStart(open?.start_at ?? null);
      } else {
        setActiveBreakStart(null);
      }
    }
    loadBreak();
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.status]);

  const handleCheckIn = async (payload: CapturePayload) => {
    if (!user) return;
    await checkIn(user.id, staffData?.id ?? null, payload);
    toast({ title: 'Checked in', description: 'Have a great shift!' });
    refresh();
  };

  const handleCheckOut = async (payload: CapturePayload) => {
    if (!user || !session) return;
    await checkOut(user.id, session, payload);
    toast({ title: 'Checked out', description: 'Session saved successfully.' });
    refresh();
  };

  const handleStartBreak = async () => {
    if (!session) return;
    setBreakLoading(true);
    try {
      await startBreak(session.id);
      toast({ title: 'Break started' });
      refresh();
    } catch (e) {
      toast({
        title: 'Failed',
        description: e instanceof Error ? e.message : 'Could not start break',
        variant: 'destructive',
      });
    } finally {
      setBreakLoading(false);
    }
  };

  const handleEndBreak = async () => {
    if (!session) return;
    setBreakLoading(true);
    try {
      await endBreak(session.id);
      toast({ title: 'Break ended' });
      refresh();
    } catch (e) {
      toast({
        title: 'Failed',
        description: e instanceof Error ? e.message : 'Could not end break',
        variant: 'destructive',
      });
    } finally {
      setBreakLoading(false);
    }
  };

  // If staff is not tracked in attendance, hide the widget entirely
  const tracked = (staffData as unknown as { attendance_tracked?: boolean })?.attendance_tracked !== false;
  if (!tracked) return null;

  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-card border-0">
        <CardContent className="p-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading attendance…
        </CardContent>
      </Card>
    );
  }

  // ---- COMPLETED today, no active session ----
  if (!session && todayCompleted) {
    return (
      <Card className="rounded-2xl shadow-card border-0 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold">Shift completed</h3>
                <Badge variant="secondary" className="text-[10px]">
                  {format(new Date(todayCompleted.work_date), 'dd MMM')}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">In</p>
                  <p className="font-medium">
                    {format(new Date(todayCompleted.check_in_at), 'hh:mm a')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Out</p>
                  <p className="font-medium">
                    {todayCompleted.check_out_at
                      ? format(new Date(todayCompleted.check_out_at), 'hh:mm a')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Worked</p>
                  <p className="font-medium">{formatMinutes(todayCompleted.worked_minutes)}</p>
                </div>
              </div>
              {todayCompleted.total_break_minutes > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Break time: {formatMinutes(todayCompleted.total_break_minutes)}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCheckIn(true)}
              className="shrink-0"
            >
              <LogIn className="mr-2 h-4 w-4" />
              New shift
            </Button>
          </div>
        </CardContent>
        <CaptureDialog
          open={showCheckIn}
          onOpenChange={setShowCheckIn}
          title="Check in"
          description="Take a selfie and share your location to start a new shift."
          actionLabel="Check in"
          onCapture={handleCheckIn}
        />
      </Card>
    );
  }

  // ---- NO active session, NOT completed today ----
  if (!session) {
    return (
      <Card className="rounded-2xl shadow-card border-0 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Ready for your shift?</h3>
                <p className="text-xs text-muted-foreground">
                  Check in with a photo and your location.
                </p>
              </div>
            </div>
            <Button onClick={() => setShowCheckIn(true)} size="lg">
              <LogIn className="mr-2 h-5 w-5" />
              Check In
            </Button>
          </div>
        </CardContent>
        <CaptureDialog
          open={showCheckIn}
          onOpenChange={setShowCheckIn}
          title="Check in"
          description="Take a selfie and share your location to start your shift."
          actionLabel="Check in"
          onCapture={handleCheckIn}
        />
      </Card>
    );
  }

  // ---- ACTIVE or ON_BREAK ----
  const onBreak = session.status === 'on_break';
  const elapsed = formatElapsed(session.check_in_at, tick);
  const breakElapsed = activeBreakStart ? formatElapsed(activeBreakStart, tick) : null;

  return (
    <Card className="rounded-2xl shadow-card border-0 bg-gradient-to-br from-primary/10 to-transparent">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                    onBreak ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    onBreak ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
              </span>
              <h3 className="font-semibold">
                {onBreak ? 'On break' : 'On shift'}
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                Started {format(new Date(session.check_in_at), 'hh:mm a')}
              </Badge>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <p className="font-mono text-3xl font-bold tabular-nums">{elapsed}</p>
              {onBreak && breakElapsed && (
                <p className="text-sm text-amber-600">
                  Break: <span className="font-mono font-semibold">{breakElapsed}</span>
                </p>
              )}
            </div>
            {session.total_break_minutes > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Total break so far: {formatMinutes(session.total_break_minutes)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!onBreak ? (
            <Button
              variant="outline"
              onClick={handleStartBreak}
              disabled={breakLoading}
              className="flex-1 min-w-[140px]"
            >
              {breakLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Coffee className="mr-2 h-4 w-4" />
              )}
              Start Break
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleEndBreak}
              disabled={breakLoading}
              className="flex-1 min-w-[140px]"
            >
              {breakLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              End Break
            </Button>
          )}
          <Button
            onClick={() => setShowCheckOut(true)}
            variant="destructive"
            className="flex-1 min-w-[140px]"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Check Out
          </Button>
        </div>
      </CardContent>

      <CaptureDialog
        open={showCheckOut}
        onOpenChange={setShowCheckOut}
        title="Check out"
        description="Take a selfie and share your location to end your shift."
        actionLabel="Check out"
        onCapture={handleCheckOut}
      />
    </Card>
  );
}
