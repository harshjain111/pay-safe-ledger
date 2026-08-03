import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, CalendarOff, Loader2 } from 'lucide-react';
import { computeLeaveBalancesForStaff, type LeaveTypeBalance } from '@/lib/leave';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Staff-app card: the employee's weekly off day and their accumulated leave
 * balance broken down by type (annual / casual / sick / …) for the year.
 */
export function MyLeaveBalanceCard({ staffId, weeklyOffDay }: { staffId?: string; weeklyOffDay?: number | null }) {
  const [balances, setBalances] = useState<LeaveTypeBalance[] | null>(null);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await computeLeaveBalancesForStaff(staffId);
        if (!cancelled) setBalances(rows);
      } catch (e) {
        console.error('Failed to load leave balances', e);
        if (!cancelled) setBalances([]);
      }
    })();
    return () => { cancelled = true; };
  }, [staffId]);

  if (!staffId) return null;

  const offLabel = weeklyOffDay == null ? 'Not set' : WEEKDAYS[weeklyOffDay] ?? 'Not set';
  const shown = (balances ?? []).slice().sort((a, b) => a.type.sort_order - b.type.sort_order);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Weekly off */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Weekly off</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium">{offLabel}</span>
        </div>

        <div className="border-t" />

        {/* Leave balances by type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">My leave balance</p>
            <span className="text-[11px] text-muted-foreground">({new Date().getFullYear()})</span>
          </div>

          {balances === null ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : shown.length === 0 ? (
            <p className="py-1 text-sm text-muted-foreground">No leave types configured.</p>
          ) : (
            <ul className="space-y-1.5">
              {shown.map((b) => {
                const entitled = b.opening + b.accrued;
                const accrues = b.type.accrual !== 'none';
                return (
                  <li key={b.type.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{b.type.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {accrues ? `${b.used} used of ${entitled}` : `${b.used} taken this year`}
                      </p>
                    </div>
                    {accrues ? (
                      <span className={`shrink-0 text-base font-semibold ${b.balance <= 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {b.balance}
                        <span className="text-xs font-normal text-muted-foreground"> left</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm text-muted-foreground">Unpaid</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
