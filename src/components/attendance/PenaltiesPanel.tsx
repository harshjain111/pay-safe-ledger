import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DisciplineLogRow, formatScheduleRange } from '@/lib/discipline';
import { format } from 'date-fns';
import { Ban, Loader2, RotateCcw, ShieldAlert, AlertTriangle, UserX, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

interface Row extends DisciplineLogRow {
  staff_name?: string;
  staff_phone?: string | null;
}

export function PenaltiesPanel() {
  const { isOwner, isAdmin, user, staffData } = useAuth();
  const canManage = isOwner || isAdmin;

  const today = format(new Date(), 'yyyy-MM-dd');
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const [from, setFrom] = useState(format(start, 'yyyy-MM-dd'));
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [unscheduledStaff, setUnscheduledStaff] = useState<string[]>([]);
  const [absentToday, setAbsentToday] = useState(0);
  const [runningAbsentCheck, setRunningAbsentCheck] = useState(false);

  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<'cancel' | 'restore'>('cancel');

  const load = async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_discipline_log' as never)
        .select('*')
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date', { ascending: false });
      if (error) throw error;
      const logs = (data as DisciplineLogRow[]) ?? [];
      const staffIds = Array.from(new Set(logs.map((l) => l.staff_id)));
      const infoMap: Record<string, { name: string; phone: string | null }> = {};
      if (staffIds.length) {
        const { data: staff } = await supabase
          .from('staff')
          .select('id, full_name, phone')
          .in('id', staffIds);
        (staff ?? []).forEach((s: { id: string; full_name: string; phone: string | null }) => {
          infoMap[s.id] = { name: s.full_name, phone: s.phone };
        });
      }
      setRows(
        logs
          .filter((l) => l.fine_amount > 0 || l.is_absent)
          .map((l) => ({
            ...l,
            staff_name: infoMap[l.staff_id]?.name || 'Unknown',
            staff_phone: infoMap[l.staff_id]?.phone ?? null,
          })),
      );
    } catch (e) {
      console.error('Penalties load failed', e);
      toast.error('Failed to load penalties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // Coverage check: tracked + active staff with no shift assignment.
  // Without an assignment, the system has no scheduled in/out time → it
  // cannot decide if a check-in is late, so NO fine is logged and NO
  // WhatsApp message is sent. This is the silent-failure mode that caused
  // today's penalties to be skipped despite rules being enabled.
  useEffect(() => {
    if (!canManage) return;
    (async () => {
      try {
        const { data: staff } = await supabase
          .from('staff')
          .select('id, full_name')
          .eq('is_active', true)
          .eq('attendance_tracked', true);
        const list = (staff ?? []) as { id: string; full_name: string }[];
        if (list.length === 0) {
          setUnscheduledStaff([]);
          return;
        }
        const { data: assigns } = await supabase
          .from('staff_shift_assignments' as never)
          .select('staff_id')
          .in('staff_id', list.map((s) => s.id));
        const assigned = new Set(
          ((assigns as { staff_id: string }[]) ?? []).map((a) => a.staff_id),
        );
        setUnscheduledStaff(
          list.filter((s) => !assigned.has(s.id)).map((s) => s.full_name),
        );
      } catch (e) {
        console.error('Coverage check failed', e);
      }
    })();
  }, [canManage]);

  // Absent-today count derived from current rows
  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    setAbsentToday(rows.filter((r) => r.is_absent && r.work_date === todayStr).length);
  }, [rows]);

  const runAbsentCheck = async () => {
    setRunningAbsentCheck(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-absent-staff', { body: {} });
      if (error) throw error;
      const res = data as { total_absent?: number; notifications_sent?: number; failures?: number };
      toast.success(
        `Absent check complete — ${res?.total_absent ?? 0} marked absent, ${res?.notifications_sent ?? 0} WhatsApp sent${res?.failures ? `, ${res.failures} failed` : ''}`,
      );
      await load();
    } catch (e) {
      console.error('Absent check failed', e);
      toast.error(e instanceof Error ? e.message : 'Absent check failed');
    } finally {
      setRunningAbsentCheck(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.staff_name ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const openCancel = (r: Row) => {
    setTarget(r);
    setReason('');
    setMode('cancel');
  };
  const openRestore = (r: Row) => {
    setTarget(r);
    setReason('');
    setMode('restore');
  };

  const submit = async () => {
    if (!target) return;
    if (mode === 'cancel' && !reason.trim()) {
      toast.error('Please enter a reason');
      return;
    }
    setWorking(true);
    try {
      const actorName =
        staffData?.full_name || user?.user_metadata?.full_name || user?.email || 'Unknown';
      const payload =
        mode === 'cancel'
          ? {
              is_cancelled: true,
              cancelled_by: user?.id ?? null,
              cancelled_by_name: actorName,
              cancelled_at: new Date().toISOString(),
              cancellation_reason: reason.trim(),
            }
          : {
              is_cancelled: false,
              cancelled_by: null,
              cancelled_by_name: null,
              cancelled_at: null,
              cancellation_reason: null,
            };
      const { error } = await supabase
        .from('attendance_discipline_log' as never)
        .update(payload as never)
        .eq('id', target.id);
      if (error) throw error;

      if (mode === 'cancel') {
        const phone = (target.staff_phone || '').replace(/^\+/, '');
        if (phone) {
          try {
            const { data: waData, error: waErr } = await supabase.functions.invoke(
              'send-attendance-whatsapp',
              {
                body: {
                  staff_name: target.staff_name,
                  staff_phone: phone,
                  staff_id: target.staff_id,
                  event_type: 'penalty_waived',
                  actual_time: new Date().toISOString(),
                  scheduled_time: new Date().toISOString(),
                  slab: 'penalty_waived',
                  deduction_amount: Number(target.fine_amount) || 0,
                  penalty_date: target.work_date,
                },
              },
            );
            if (waErr || (waData && waData.success === false)) {
              toast.error('Penalty waived but WhatsApp notification failed');
            } else {
              toast.success(`Penalty waived — WhatsApp notification sent to ${target.staff_name}`);
            }
          } catch (e) {
            console.error('WhatsApp waiver notify failed', e);
            toast.error('Penalty waived but WhatsApp notification failed');
          }
        } else {
          toast.success('Penalty cancelled');
        }
      } else {
        toast.success('Penalty restored');
      }
      setTarget(null);
      await load();
    } catch (e) {
      console.error('Penalty update failed', e);
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setWorking(false);
    }
  };

  if (!canManage) return null;

  return (
    <Card className="rounded-2xl border-0 shadow-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <CardTitle>Manage Penalties</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={absentToday > 0 ? 'destructive' : 'secondary'}
              className="gap-1"
            >
              <UserX className="h-3.5 w-3.5" />
              {absentToday} absent today
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={runAbsentCheck}
              disabled={runningAbsentCheck}
              className="gap-1"
            >
              {runningAbsentCheck ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              Run Absent Check Now
            </Button>
          </div>
        </div>
        <CardDescription>
          Cancel any system-charged penalty for a staff member. Cancelled penalties won't be
          deducted at salary settlement. The original entry stays for audit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unscheduledStaff.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  {unscheduledStaff.length} tracked staff have no shift assigned — penalties and
                  WhatsApp messages are being SKIPPED for them.
                </p>
                <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
                  Without a scheduled check-in / check-out time, the system can't tell if anyone
                  is late, so no fine is logged and no message is sent. Assign a shift to fix.
                </p>
                <p className="text-xs text-muted-foreground">
                  Missing: {unscheduledStaff.slice(0, 6).join(', ')}
                  {unscheduledStaff.length > 6 ? ` +${unscheduledStaff.length - 6} more` : ''}
                </p>
                <Link
                  to="/shifts"
                  className="inline-block text-xs font-medium text-primary hover:underline mt-1"
                >
                  Go to Shifts →
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Search staff</Label>
            <Input
              placeholder="Name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={load}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No penalties charged in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Fine</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.staff_name}</TableCell>
                    <TableCell>{format(new Date(r.work_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatScheduleRange(r.scheduled_check_in, r.scheduled_check_out)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      <span className={r.is_cancelled ? 'line-through opacity-60' : ''}>
                        {r.fine_reason || (r.is_absent ? r.absent_reason || 'Absent' : '—')}
                      </span>
                      {r.is_cancelled && (
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                          Cancelled by {r.cancelled_by_name || 'system'} —{' '}
                          {r.cancellation_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          r.is_cancelled
                            ? 'line-through text-muted-foreground'
                            : 'font-semibold text-destructive'
                        }
                      >
                        ₹{Number(r.fine_amount).toFixed(0)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.is_cancelled ? (
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                          Cancelled
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.is_cancelled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRestore(r)}
                          className="gap-1"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCancel(r)}
                          className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          <Ban className="h-3.5 w-3.5" /> Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === 'cancel' ? 'Cancel penalty' : 'Restore penalty'}
            </DialogTitle>
            <DialogDescription>
              {target && (
                <span>
                  {target.staff_name} • {format(new Date(target.work_date), 'dd MMM yyyy')} •
                  ₹{Number(target.fine_amount).toFixed(0)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {mode === 'cancel' ? (
            <div className="space-y-2">
              <Label className="text-xs">Reason (required)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Traffic jam acknowledged by manager"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                The penalty will be excluded from this month's settlement. The record stays
                visible for audit.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This will restore the penalty so it counts toward the salary deduction again.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={working}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={working}>
              {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'cancel' ? 'Confirm cancellation' : 'Restore penalty'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
