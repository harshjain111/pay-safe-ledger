import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toAmount } from '@/lib/utils';
import { DisciplineLogRow, formatScheduleRange } from '@/lib/discipline';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function MyDisciplineTab() {
  const { staffData } = useAuth();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [rows, setRows] = useState<DisciplineLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staffData?.id) return;
    const start = month + '-01';
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const endStr = end.toISOString().slice(0, 10);
    setLoading(true);
    supabase
      .from('attendance_discipline_log' as never)
      .select('*')
      .eq('staff_id', staffData.id)
      .gte('work_date', start)
      .lt('work_date', endStr)
      .order('work_date', { ascending: false })
      .then(({ data }) => {
        setRows((data as DisciplineLogRow[]) ?? []);
        setLoading(false);
      });
  }, [staffData?.id, month]);

  const totals = useMemo(() => {
    return {
      fine: rows.reduce(
        (s, r) => s + (r.is_cancelled ? 0 : toAmount(r.fine_amount)),
        0,
      ),
      late: rows.filter((r) => r.late_in_minutes > 0 && !r.is_cancelled).length,
      early: rows.filter((r) => r.early_out_minutes > 0 && !r.is_cancelled).length,
      onTime: rows.filter(
        (r) => (r.fine_amount === 0 || r.is_cancelled) && !r.is_absent,
      ).length,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground">Month</label>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-[160px]"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-0 shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total fine</p>
            <p className="text-xl font-bold text-destructive">
              ₹{totals.fine.toFixed(0)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Late check-ins</p>
            <p className="text-xl font-bold">{totals.late}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Early check-outs</p>
            <p className="text-xl font-bold">{totals.early}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 shadow-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">On time</p>
            <p className="text-xl font-bold text-emerald-600">{totals.onTime}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-0 shadow-card">
        <CardContent className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No discipline records this month. Keep it up!
            </p>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">
                        {format(new Date(r.work_date), 'dd MMM yyyy')}
                      </p>
                      {r.fine_amount > 0 ? (
                        <Badge
                          variant={r.is_cancelled ? 'secondary' : 'destructive'}
                          className={`text-[10px] ${r.is_cancelled ? 'line-through' : ''}`}
                        >
                          ₹{toAmount(r.fine_amount).toFixed(0)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> On time
                        </Badge>
                      )}
                      {r.is_cancelled && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-emerald-500/15 text-emerald-700"
                        >
                          Cancelled
                        </Badge>
                      )}
                      {r.is_absent && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" /> Absent
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Scheduled:{' '}
                      {formatScheduleRange(r.scheduled_check_in, r.scheduled_check_out)}
                    </p>
                    {r.fine_reason && (
                      <p className="text-xs mt-0.5">{r.fine_reason}</p>
                    )}
                    {r.is_cancelled && r.cancellation_reason && (
                      <p className="text-[11px] mt-0.5 text-emerald-600">
                        Waived: {r.cancellation_reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
