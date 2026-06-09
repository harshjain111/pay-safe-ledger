import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CalendarDays } from 'lucide-react';
import {
  fetchLeaveSettings,
  entitledForYear,
  fetchTakenLeaveByStaff,
  fetchCompOffByStaff,
  computeBalance,
} from '@/lib/leave';

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
      const now = new Date();
      const year = now.getFullYear();
      const [settings, taken, compOff, staffRes] = await Promise.all([
        fetchLeaveSettings(),
        fetchTakenLeaveByStaff(year),
        fetchCompOffByStaff(year),
        supabase.from('staff_public').select('id, full_name, is_active').eq('is_active', true).order('full_name'),
      ]);
      const entitled = entitledForYear(settings, year, now);
      const list: Row[] = ((staffRes.data ?? []) as { id: string; full_name: string }[]).map((s) => {
        const t = taken[s.id] ?? 0;
        const c = compOff[s.id] ?? 0;
        return {
          id: s.id,
          full_name: s.full_name,
          remaining: computeBalance(entitled, t, c).remaining,
          available: entitled + c,
        };
      });
      if (!cancelled) {
        setRows(list);
        setLoading(false);
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
