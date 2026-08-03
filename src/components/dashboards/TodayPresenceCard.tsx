import { Card, CardContent } from '@/components/ui/card';
import { LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { useCurrentAttendanceSession } from '@/hooks/useCurrentAttendanceSession';

/** Staff dashboard: today's presence status + login (check-in) and log-off
 *  (check-out) times. Always visible — works for biometric punches even when
 *  in-app self check-in is turned off. */
export function TodayPresenceCard({ userId }: { userId?: string }) {
  const { session, todayCompleted, isLoading } = useCurrentAttendanceSession(userId);

  const active = session;
  const done = todayCompleted;
  const checkIn = active?.check_in_at ?? done?.check_in_at ?? null;
  const checkOut = done?.check_out_at ?? null;

  const state: 'on_shift' | 'completed' | 'absent' = active ? 'on_shift' : done ? 'completed' : 'absent';
  const label = state === 'on_shift' ? 'On shift' : state === 'completed' ? 'Completed' : 'Not checked in';
  const dot = state === 'on_shift' ? 'bg-emerald-500' : state === 'completed' ? 'bg-blue-500' : 'bg-amber-500';
  const chip =
    state === 'on_shift'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
      : state === 'completed'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';

  const time = (iso: string | null) => (iso ? format(new Date(iso), 'hh:mm a') : '—');

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {state === 'on_shift' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dot}`} />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
            </span>
            <div>
              <p className="text-sm font-medium leading-none">Today</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{format(new Date(), 'EEEE, dd MMM')}</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip}`}>
            {isLoading ? '…' : label}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><LogIn className="h-3.5 w-3.5" /> Login</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{time(checkIn)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><LogOut className="h-3.5 w-3.5" /> Log off</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{time(checkOut)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
