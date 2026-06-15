import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, addYears } from 'date-fns';
import { CalendarCheck, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useHolidays } from '@/hooks/useHolidays';
import { expandHolidaysInRange } from '@/lib/holidays';

/**
 * Compact Holidays panel for Settings > Attendance & Leave. Shows the next few
 * holidays and links to the full management page (/holidays).
 */
export function HolidaysCard() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const { holidays, loading } = useHolidays();

  const today = format(new Date(), 'yyyy-MM-dd');
  const horizon = format(addYears(new Date(), 1), 'yyyy-MM-dd');
  const upcoming = useMemo(
    () => expandHolidaysInRange(holidays, today, horizon).slice(0, 5),
    [holidays, today, horizon],
  );

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <CalendarCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Holidays
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Public, optional &amp; restricted holidays. A mandatory paid holiday is a paid non-working day; working it earns comp-off / OT.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming holidays configured.</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map((o) => (
              <div key={`${o.holiday.id}-${o.date}`} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                <span className="truncate font-medium">{o.holiday.name}</span>
                <span className="shrink-0 text-muted-foreground">{format(parseISO(o.date), 'EEE, dd MMM yyyy')}</span>
              </div>
            ))}
          </div>
        )}
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/holidays">Manage holidays <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}
