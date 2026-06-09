import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';
import {
  fetchLeaveSettings,
  entitledForYear,
  fetchTakenLeaveForStaff,
  fetchCompOffForStaff,
  computeBalance,
} from '@/lib/leave';

/** Staff-app pending paid-leave balance for the logged-in staff member. */
export function MyLeaveBalanceCard({ staffId }: { staffId?: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [entitled, setEntitled] = useState(0);
  const [taken, setTaken] = useState(0);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const year = now.getFullYear();
      const [settings, takenCount, compOff] = await Promise.all([
        fetchLeaveSettings(),
        fetchTakenLeaveForStaff(staffId, year),
        fetchCompOffForStaff(staffId, year),
      ]);
      const ent = entitledForYear(settings, year, now);
      const bal = computeBalance(ent, takenCount, compOff);
      if (!cancelled) {
        setRemaining(bal.remaining);
        setEntitled(ent + compOff);
        setTaken(takenCount);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (!staffId || remaining === null) return null;

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Paid leave remaining</p>
            <p className="text-[11px] text-muted-foreground">{taken} taken this year</p>
          </div>
        </div>
        <span className={`text-lg font-semibold ${remaining <= 0 ? 'text-destructive' : 'text-foreground'}`}>
          {remaining}
          <span className="text-xs font-normal text-muted-foreground"> / {entitled}</span>
        </span>
      </CardContent>
    </Card>
  );
}
