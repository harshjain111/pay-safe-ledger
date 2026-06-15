import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPinOff, Check, X, Loader2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';

interface FlaggedRow {
  id: string;
  check_in_at: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  geo_distance_m: number | null;
  staff_id: string | null;
  staffName: string;
  employeeId: string;
}

/**
 * Out-of-geofence check-ins awaiting a manager decision (soft-flag mode). Self
 * contained — renders nothing when there's nothing to review. Owner/admin can
 * accept (legitimate) or reject (invalid location).
 */
export function GeoFlaggedPunches({ onChange }: { onChange?: () => void }) {
  const [rows, setRows] = useState<FlaggedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data: sessions } = await supabase
      .from('attendance_sessions')
      .select('id, check_in_at, check_in_lat, check_in_lng, geo_distance_m, staff_id')
      .eq('geo_flagged', true)
      .is('geo_review', null)
      .order('check_in_at', { ascending: false });

    const list = (sessions ?? []) as Array<Omit<FlaggedRow, 'staffName' | 'employeeId'>>;
    const staffIds = [...new Set(list.map((s) => s.staff_id).filter((x): x is string => !!x))];
    const nameById = new Map<string, { full_name: string; employee_id: string }>();
    if (staffIds.length) {
      const { data: staffRows } = await supabase.from('staff').select('id, full_name, employee_id').in('id', staffIds);
      for (const s of (staffRows ?? []) as { id: string; full_name: string; employee_id: string }[]) {
        nameById.set(s.id, { full_name: s.full_name, employee_id: s.employee_id });
      }
    }
    setRows(
      list.map((s) => ({
        ...s,
        staffName: (s.staff_id && nameById.get(s.staff_id)?.full_name) || 'Staff',
        employeeId: (s.staff_id && nameById.get(s.staff_id)?.employee_id) || '',
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const review = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(id);
    const { error } = await supabase.from('attendance_sessions').update({ geo_review: decision }).eq('id', id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(decision === 'approved' ? 'Check-in accepted' : 'Check-in marked invalid');
    reload();
    onChange?.();
  };

  if (loading || rows.length === 0) return null;

  return (
    <Card className="border-amber-300/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPinOff className="h-4 w-4 text-amber-600" />
          Out-of-geofence check-ins
          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => {
          const maps = r.check_in_lat != null && r.check_in_lng != null
            ? `https://www.google.com/maps?q=${r.check_in_lat},${r.check_in_lng}`
            : null;
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{r.staffName}</span>
                  {r.employeeId && <span className="text-[11px] text-muted-foreground">{r.employeeId}</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format(new Date(r.check_in_at), 'dd MMM, hh:mm a')}
                  {r.geo_distance_m != null && (
                    <> · <span className="font-medium text-amber-600">{Math.round(r.geo_distance_m)} m away</span></>
                  )}
                  {maps && (
                    <> · <a href={maps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">map<ExternalLink className="h-3 w-3" /></a></>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="outline" className="gap-1 text-success hover:text-success" disabled={busy === r.id} onClick={() => review(r.id, 'approved')}>
                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-destructive hover:text-destructive" disabled={busy === r.id} onClick={() => review(r.id, 'rejected')}>
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
