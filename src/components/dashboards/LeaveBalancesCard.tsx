import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/anyClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CalendarDays } from 'lucide-react';

interface Row {
  id: string;
  full_name: string;
  remaining: number;
  available: number;
}

/** Pending paid-leave balance for every active staff member (owner/admin view). */
export function LeaveBalancesCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // One RPC for what used to be four calls (leave settings, leave taken,
        // comp-off, staff list) plus the join between them on the client. The
        // entitlement rule is unchanged — it still follows the default leave
        // type and prorates monthly accrual the same way entitledForYear does.
        const { data, error } = await supabase.rpc('get_leave_balances_overview', { _year: null });
        if (error) throw error;
        const list = (((data ?? {}) as { rows?: Row[] }).rows ?? []).map((r) => ({
          id: r.id,
          full_name: r.full_name,
          remaining: Number(r.remaining),
          available: Number(r.available),
        }));
        if (!cancelled) setRows(list);
      } catch (e) {
        console.error('Failed to load leave balances', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" />
          Pending Leaves
        </CardTitle>
        <CardDescription className="text-xs">Remaining paid leave this year (remaining / entitled)</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No active staff</p>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                <span className="truncate">{r.full_name}</span>
                <span className={`shrink-0 font-medium ${r.remaining <= 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {r.remaining} <span className="text-xs font-normal text-muted-foreground">/ {r.available}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
