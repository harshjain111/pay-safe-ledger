import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, eachDayOfInterval, startOfMonth } from 'date-fns';
import { Users2, ArrowRight, Loader2, Check, Search, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { toast } from '@/lib/toast';
import {
  planBulkAdjustment, type BulkAction, type BulkStaff, type ChangeRow,
  type CurrentSessionDay, type CurrentRosterDay,
} from '@/lib/bulk-attendance';

interface Option { id: string; name: string }
interface StaffRow { id: string; full_name: string; employee_id: string; user_id: string | null; outlet_id: string | null; department_id: string | null }
interface Shift { id: string; name: string }

const ACTIONS: { value: BulkAction; label: string }[] = [
  { value: 'present', label: 'Mark present (full day)' },
  { value: 'half_day', label: 'Mark half day' },
  { value: 'absent', label: 'Mark absent (clear punches)' },
  { value: 'set_punches', label: 'Set punch times' },
  { value: 'set_shift', label: 'Set a shift' },
  { value: 'paid_off', label: 'Mark a paid off-day' },
];

const MAX_CELLS = 2500;

export default function BulkAttendance() {
  const { user, can } = useAuth();
  const canManage = can('attendance.manage');

  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [outletId, setOutletId] = useState('all');
  const [departmentId, setDepartmentId] = useState('all');
  const [action, setAction] = useState<BulkAction>('present');
  const [shiftId, setShiftId] = useState('');
  const [inTime, setInTime] = useState('09:00');
  const [outTime, setOutTime] = useState('17:00');

  const [outlets, setOutlets] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [staffSearch, setStaffSearch] = useState('');

  const [preview, setPreview] = useState<ChangeRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const dates = useMemo(() => {
    if (!from || !to || from > to) return [];
    return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((d) => format(d, 'yyyy-MM-dd'));
  }, [from, to]);

  // Option lists.
  useEffect(() => {
    (async () => {
      const [o, d, s] = await Promise.all([
        supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
        supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
        supabase.from('shifts').select('id, name').eq('is_active', true).order('name'),
      ]);
      setOutlets((o.data ?? []) as Option[]);
      setDepartments((d.data ?? []) as Option[]);
      setShifts((s.data ?? []) as Shift[]);
    })();
  }, []);

  // Matching staff (resets selection to all matching).
  useEffect(() => {
    if (!canManage) return;
    (async () => {
      let q = supabase
        .from('staff')
        .select('id, full_name, employee_id, user_id, outlet_id, department_id')
        .eq('is_active', true)
        .eq('attendance_tracked', true)
        .order('full_name');
      if (outletId !== 'all') q = q.eq('outlet_id', outletId);
      if (departmentId !== 'all') q = q.eq('department_id', departmentId);
      const { data } = await q;
      const rows = (data ?? []) as StaffRow[];
      setStaff(rows);
      setSelected(new Set(rows.map((r) => r.id)));
      setPreview(null);
    })();
  }, [canManage, outletId, departmentId]);

  const filteredStaff = useMemo(() => {
    const term = staffSearch.trim().toLowerCase();
    return term ? staff.filter((s) => s.full_name.toLowerCase().includes(term) || s.employee_id.toLowerCase().includes(term)) : staff;
  }, [staff, staffSearch]);

  const cellCount = selected.size * dates.length;
  const toggleStaff = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
    setPreview(null);
  };

  const buildPreview = async () => {
    if (selected.size === 0 || dates.length === 0) { toast.error('Pick a date range and at least one staff member'); return; }
    if (cellCount > MAX_CELLS) { toast.error(`That's ${cellCount} cells — narrow the range or staff (max ${MAX_CELLS}).`); return; }
    if (action === 'set_shift' && !shiftId) { toast.error('Pick a shift'); return; }
    setPreviewing(true);
    try {
      const staffIds = [...selected];
      const [sessRes, rosRes] = await Promise.all([
        supabase.from('attendance_sessions').select('staff_id, work_date, status, worked_minutes').in('staff_id', staffIds).gte('work_date', from).lte('work_date', to),
        supabase.from('staff_roster').select('staff_id, roster_date, shift_id, is_off').in('staff_id', staffIds).gte('roster_date', from).lte('roster_date', to),
      ]);

      const sessionsByStaffDate = new Map<string, CurrentSessionDay>();
      for (const s of (sessRes.data ?? []) as { staff_id: string; work_date: string; status: string; worked_minutes: number | null }[]) {
        const k = `${s.staff_id}|${s.work_date}`;
        const cur = sessionsByStaffDate.get(k) ?? { status: s.status, worked: 0, count: 0 };
        cur.count += 1;
        if (s.status === 'completed') { cur.worked += Number(s.worked_minutes ?? 0); cur.status = 'completed'; }
        sessionsByStaffDate.set(k, cur);
      }
      const rosterByStaffDate = new Map<string, CurrentRosterDay>();
      for (const r of (rosRes.data ?? []) as { staff_id: string; roster_date: string; shift_id: string | null; is_off: boolean }[]) {
        rosterByStaffDate.set(`${r.staff_id}|${r.roster_date}`, { shift_id: r.shift_id, is_off: r.is_off });
      }

      const rulesRes = await supabase.from('hr_pay_rules' as never).select('full_day_minutes, half_day_minutes').maybeSingle();
      const rr = (rulesRes.data ?? null) as { full_day_minutes?: number; half_day_minutes?: number } | null;

      const bulkStaff: BulkStaff[] = staff.filter((s) => selected.has(s.id)).map((s) => ({ id: s.id, full_name: s.full_name, employee_id: s.employee_id, user_id: s.user_id }));
      const rows = planBulkAdjustment({
        staff: bulkStaff,
        dates,
        action,
        params: { shiftId: shiftId || undefined, shiftName: shifts.find((s) => s.id === shiftId)?.name, inTime, outTime },
        rules: { fullDayMinutes: rr?.full_day_minutes ?? 480, halfDayMinutes: rr?.half_day_minutes ?? 240 },
        sessionsByStaffDate,
        rosterByStaffDate,
      });
      setPreview(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to build preview');
    } finally {
      setPreviewing(false);
    }
  };

  const changedRows = useMemo(() => (preview ?? []).filter((r) => r.changed), [preview]);

  const commit = async () => {
    if (changedRows.length === 0) return;
    setCommitting(true);
    try {
      for (const row of changedRows) {
        const w = row.write;
        if (w.op === 'clearSessions') {
          const { error } = await supabase.from('attendance_sessions').delete().eq('staff_id', w.staffId).eq('work_date', w.date);
          if (error) throw error;
        } else if (w.op === 'upsertSession') {
          await supabase.from('attendance_sessions').delete().eq('staff_id', w.staffId).eq('work_date', w.date);
          const { error } = await supabase.from('attendance_sessions').insert({
            staff_id: w.staffId,
            user_id: w.userId,
            work_date: w.date,
            check_in_at: w.checkInAt,
            check_out_at: w.checkOutAt,
            check_in_photo_url: 'manual',
            worked_minutes: w.workedMinutes,
            status: 'completed',
            source: w.source,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('staff_roster')
            .upsert({ staff_id: w.staffId, roster_date: w.date, shift_id: w.shiftId, is_off: w.isOff }, { onConflict: 'staff_id,roster_date' });
          if (error) throw error;
        }
      }

      // One audit entry capturing actor + scope of the bulk edit.
      const scope = {
        action,
        from, to,
        outlet_id: outletId === 'all' ? null : outletId,
        department_id: departmentId === 'all' ? null : departmentId,
        staff_count: selected.size,
        date_count: dates.length,
        changes: changedRows.length,
        params: action === 'set_shift' ? { shift_id: shiftId } : action === 'set_punches' ? { in: inTime, out: outTime } : {},
        affected: changedRows.slice(0, 500).map((r) => ({ staff_id: r.staffId, date: r.date })),
      };
      const { error: auditErr } = await supabase.rpc('log_bulk_attendance_adjustment', { _action: `bulk_${action}`, _scope: scope });
      if (auditErr) console.error('Audit log failed', auditErr);

      toast.success(`Applied ${changedRows.length} change${changedRows.length === 1 ? '' : 's'}`);
      setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply changes');
    } finally {
      setCommitting(false);
    }
  };

  if (!canManage) {
    return <EmptyState icon={ShieldAlert} title="Access Denied" description="You need the “Manage attendance” permission to use bulk adjustments." />;
  }

  const columns: DataTableColumn<ChangeRow>[] = [
    { id: 'name', header: 'Staff', sortable: true, sortAccessor: (r) => r.staffName, cell: (r) => <div><div className="font-medium">{r.staffName}</div><div className="text-[11px] text-muted-foreground">{r.employeeId}</div></div> },
    { id: 'date', header: 'Date', sortable: true, sortAccessor: (r) => r.date, cell: (r) => format(parseISO(r.date), 'dd MMM') },
    { id: 'before', header: 'Current', cell: (r) => <span className="text-muted-foreground">{r.before}</span> },
    { id: 'after', header: 'New', cell: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={cn('font-medium', r.changed ? 'text-foreground' : 'text-muted-foreground')}>{r.after}</span>
      </span>
    ) },
    { id: 'changed', header: '', cell: (r) => (r.changed ? <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">Change</Badge> : <span className="text-[11px] text-muted-foreground">No change</span>) },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Bulk Attendance" description="Adjust attendance for many staff in one action — preview, then confirm." />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} /></div>
            <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPreview(null); }} /></div>
            <div className="space-y-1">
              <Label className="text-xs">Branch</Label>
              <Select value={outletId} onValueChange={setOutletId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover"><SelectItem value="all">All branches</SelectItem>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover"><SelectItem value="all">All departments</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={(v) => { setAction(v as BulkAction); setPreview(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">{ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {action === 'set_shift' && (
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs">Shift</Label>
                <Select value={shiftId} onValueChange={(v) => { setShiftId(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                  <SelectContent className="bg-popover">{shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {action === 'set_punches' && (
              <>
                <div className="space-y-1"><Label className="text-xs">In</Label><Input type="time" value={inTime} onChange={(e) => { setInTime(e.target.value); setPreview(null); }} /></div>
                <div className="space-y-1"><Label className="text-xs">Out</Label><Input type="time" value={outTime} onChange={(e) => { setOutTime(e.target.value); setPreview(null); }} /></div>
              </>
            )}
          </div>

          {/* Staff selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Staff ({selected.size} of {staff.length} · {dates.length} day{dates.length === 1 ? '' : 's'} = {cellCount} cells)</Label>
              <div className="flex gap-2 text-[11px]">
                <button type="button" className="text-primary hover:underline" onClick={() => { setSelected(new Set(staff.map((s) => s.id))); setPreview(null); }}>All</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => { setSelected(new Set()); setPreview(null); }}>None</button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Search staff…" className="h-8 pl-8 text-sm" />
            </div>
            <div className="grid max-h-44 grid-cols-1 gap-0.5 overflow-y-auto rounded-lg border p-1 sm:grid-cols-2">
              {filteredStaff.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => toggleStaff(s.id)} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', on ? 'bg-primary/10' : 'hover:bg-muted')}>
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="truncate">{s.full_name}</span>
                  </button>
                );
              })}
              {filteredStaff.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No staff match</p>}
            </div>
          </div>

          <Button onClick={buildPreview} disabled={previewing} className="gap-1.5">
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
            Preview changes
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{changedRows.length}</span> of {preview.length} will change
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={changedRows.length === 0 || committing} className="gap-1.5">
                  {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Apply {changedRows.length} change{changedRows.length === 1 ? '' : 's'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply bulk attendance change?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This writes {changedRows.length} change{changedRows.length === 1 ? '' : 's'} through the attendance pipeline (reflecting in attendance, reports &amp; settlements) and records the edit in the Audit Log. It can override existing punches for those days.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={commit}>Apply changes</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <DataTable columns={columns} data={preview} rowKey={(r) => `${r.staffId}|${r.date}`} pageSize={25} density="compact" initialSort={{ columnId: 'name', direction: 'asc' }} />
        </div>
      )}
    </div>
  );
}
