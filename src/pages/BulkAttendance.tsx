// ============================================================================
// Bulk Attendance Adjustments — grid editor.
// Rows = staff, Columns = dates. Each cell is a dropdown of attendance codes:
//   FD  = Full day        (attendance_sessions, 480 min from 09:00)
//   HD  = Half day        (attendance_sessions, 240 min from 09:00)
//   A   = Absent          (clear sessions / roster / leave)
//   WO  = Week off        (staff_roster.is_off = true, sessions cleared)
//   LWP = Leave w/o pay   (leave_records unpaid, sessions cleared)
// Edits are staged client-side, highlighted, then committed on Save.
// ============================================================================

import { useEffect, useMemo, useState, useRef } from 'react';
import { format, parseISO, eachDayOfInterval, startOfMonth } from 'date-fns';
import {
  Loader2, Search, ShieldAlert, Info, Save, FileSpreadsheet, RotateCcw, RefreshCw, ArrowRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';

type Code = 'FD' | 'HD' | 'A' | 'WO' | 'LV';
const CODES: Code[] = ['FD', 'HD', 'A', 'WO', 'LV'];
const CODE_LABEL: Record<Code, string> = {
  FD: 'Full Day',
  HD: 'Half Day',
  A: 'Absent',
  WO: 'Week Off',
  LV: 'Leave',
};
const CODE_COLOR: Record<Code, string> = {
  FD: 'text-emerald-700 dark:text-emerald-400',
  HD: 'text-amber-700 dark:text-amber-400',
  A: 'text-rose-700 dark:text-rose-400',
  WO: 'text-slate-600 dark:text-slate-300',
  LV: 'text-violet-700 dark:text-violet-400',
};

interface Branch { id: string; name: string }
interface StaffRow {
  id: string; full_name: string; employee_id: string; user_id: string | null;
  department: string | null; designation: string | null; outlet_id: string | null;
}

interface CellState {
  current: Code; pending: Code | null;
  checkIn: string | null;      // ISO
  checkOut: string | null;     // ISO
  worked: number | null;       // minutes
  designated: number | null;   // scheduled minutes for the day (roster/shift)
  late: boolean;               // checked in after scheduled start + grace
  earlyOut: boolean;           // checked out before scheduled end − grace
  leaveType: string | null;    // approved leave type name that day
  hasLeave: boolean;           // an approved leave exists (LV selectable)
}

const IST = '+05:30';
const FULL_DAY_MIN = 480;
const HALF_DAY_MIN = 240;

const pad = (n: number) => String(n).padStart(2, '0');

// IST wall-clock HH:MM[:SS] on `date` → UTC ISO (for comparing with punch times).
function scheduledIso(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCMinutes(d.getUTCMinutes() + h * 60 + (m || 0) - (5 * 60 + 30));
  return d.toISOString();
}
// Duration in minutes between two IST time strings (handles overnight).
function shiftMinutes(inT: string, outT: string): number {
  const [ih, im] = inT.split(':').map(Number);
  const [oh, om] = outT.split(':').map(Number);
  let d = (oh * 60 + (om || 0)) - (ih * 60 + (im || 0));
  if (d <= 0) d += 24 * 60;
  return d;
}
const fmtTime = (iso: string | null) => (iso ? format(new Date(iso), 'HH:mm') : '—');
const fmtDur = (min: number | null | undefined) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
};

export default function BulkAttendance() {
  const { user, can } = useAuth();
  const canManage = can('attendance.manage');

  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(today, 'yyyy-MM-dd'));
  const [branchId, setBranchId] = useState<string>('all');
  const [branches, setBranches] = useState<Branch[]>([]);

  // Search filters in header
  const [empSearch, setEmpSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [deptSearch, setDeptSearch] = useState('');
  const [desigSearch, setDesigSearch] = useState('');

  const [staff, setStaff] = useState<StaffRow[]>([]);
  // grid[staffId][date] = CellState
  const [grid, setGrid] = useState<Record<string, Record<string, CellState>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const dates = useMemo(() => {
    if (!from || !to || from > to) return [];
    return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((d) => format(d, 'yyyy-MM-dd'));
  }, [from, to]);

  // Branches list
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('outlets').select('id, name').eq('is_active', true).order('name');
      setBranches((data ?? []) as Branch[]);
    })();
  }, []);

  const fetchGrid = async () => {
    if (!canManage) return;
    if (!from || !to || from > to) { toast.error('Pick a valid date range'); return; }
    if (dates.length > 62) { toast.error('Date range too wide — keep it under ~2 months'); return; }
    setLoading(true);
    try {
      let q = supabase
        .from('staff')
        .select('id, full_name, employee_id, user_id, department, designation, outlet_id')
        .eq('is_active', true)
        .eq('attendance_tracked', true)
        .order('employee_id', { ascending: true, nullsFirst: false })
        .order('full_name');
      if (branchId !== 'all') q = q.eq('outlet_id', branchId);
      const { data: staffData, error: staffErr } = await q;
      if (staffErr) throw staffErr;
      const rows = (staffData ?? []) as StaffRow[];
      setStaff(rows);

      const ids = rows.map((r) => r.id);
      if (ids.length === 0) {
        setGrid({});
        setHasSearched(true);
        return;
      }

      const [sessRes, rosRes, leaveRes, asnRes, shiftRes, ruleRes, typeRes] = await Promise.all([
        supabase.from('attendance_sessions')
          .select('staff_id, work_date, status, worked_minutes, check_in_at, check_out_at')
          .in('staff_id', ids).gte('work_date', from).lte('work_date', to),
        supabase.from('staff_roster')
          .select('staff_id, roster_date, shift_id, is_off')
          .in('staff_id', ids).gte('roster_date', from).lte('roster_date', to),
        supabase.from('leave_records')
          .select('staff_id, leave_date, leave_type, leave_type_id, status')
          .in('staff_id', ids).gte('leave_date', from).lte('leave_date', to)
          .eq('status', 'approved'),
        supabase.from('staff_shift_assignments' as never).select('staff_id, shift_id').in('staff_id', ids),
        supabase.from('shifts').select('id, check_in_time, check_out_time'),
        supabase.from('discipline_rules' as never).select('grace_minutes_in, grace_minutes_out').order('updated_at', { ascending: false }).limit(1),
        supabase.from('leave_types').select('id, name'),
      ]);

      // Sessions: earliest check-in, latest check-out, summed worked minutes.
      const sessMap = new Map<string, { status: string; worked: number; checkIn: string | null; checkOut: string | null }>();
      for (const s of (sessRes.data ?? []) as any[]) {
        const k = `${s.staff_id}|${s.work_date}`;
        const cur = sessMap.get(k) ?? { status: s.status, worked: 0, checkIn: null, checkOut: null };
        if (s.status === 'completed') { cur.status = 'completed'; cur.worked += Number(s.worked_minutes ?? 0); }
        if (s.check_in_at && (!cur.checkIn || s.check_in_at < cur.checkIn)) cur.checkIn = s.check_in_at;
        if (s.check_out_at && (!cur.checkOut || s.check_out_at > cur.checkOut)) cur.checkOut = s.check_out_at;
        sessMap.set(k, cur);
      }
      const rosMap = new Map<string, { is_off: boolean; shift_id: string | null }>();
      for (const r of (rosRes.data ?? []) as any[]) rosMap.set(`${r.staff_id}|${r.roster_date}`, { is_off: r.is_off, shift_id: r.shift_id });
      const typeName = new Map<string, string>(((typeRes.data ?? []) as any[]).map((t) => [t.id, t.name]));
      const leaveMap = new Map<string, string>();
      for (const l of (leaveRes.data ?? []) as any[]) leaveMap.set(`${l.staff_id}|${l.leave_date}`, (l.leave_type_id && typeName.get(l.leave_type_id)) || l.leave_type || 'Leave');
      const asnByStaff = new Map<string, string>();
      for (const a of (asnRes.data ?? []) as any[]) if (a.shift_id) asnByStaff.set(a.staff_id, a.shift_id);
      const shiftById = new Map<string, { in: string; out: string }>(((shiftRes.data ?? []) as any[]).map((s) => [s.id, { in: s.check_in_time, out: s.check_out_time }]));
      const rule = ((ruleRes.data ?? []) as any[])[0] ?? {};
      const graceIn = Number(rule.grace_minutes_in ?? 10);
      const graceOut = Number(rule.grace_minutes_out ?? 10);

      const next: Record<string, Record<string, CellState>> = {};
      for (const st of rows) {
        next[st.id] = {};
        for (const d of dates) {
          const k = `${st.id}|${d}`;
          const lv = leaveMap.get(k) ?? null;
          const ros = rosMap.get(k);
          const sess = sessMap.get(k);

          // Scheduled shift for the day: roster's shift, else the staff's assigned shift.
          const shiftId = ros?.shift_id ?? asnByStaff.get(st.id) ?? null;
          const sched = shiftId ? shiftById.get(shiftId) : undefined;
          const designated = sched ? shiftMinutes(sched.in, sched.out) : null;

          let late = false, earlyOut = false;
          if (sched && sess?.checkIn) {
            const schedInISO = scheduledIso(d, sched.in);
            late = new Date(sess.checkIn).getTime() > new Date(schedInISO).getTime() + graceIn * 60000;
          }
          if (sched && sess?.checkOut && designated) {
            const [ih, im] = sched.in.split(':').map(Number);
            const [oh, om] = sched.out.split(':').map(Number);
            const overnight = (oh * 60 + (om || 0)) - (ih * 60 + (im || 0)) <= 0;
            let schedOutMs = new Date(scheduledIso(d, sched.out)).getTime();
            if (overnight) schedOutMs += 24 * 3600000; // shift ends next calendar day
            earlyOut = new Date(sess.checkOut).getTime() < schedOutMs - graceOut * 60000;
          }

          let code: Code = 'A';
          if (lv) code = 'LV';
          else if (sess && sess.status === 'completed' && sess.worked >= FULL_DAY_MIN - 30) code = 'FD';
          else if (sess && sess.status === 'completed' && sess.worked >= HALF_DAY_MIN - 30) code = 'HD';
          else if (ros?.is_off) code = 'WO';
          else code = 'A';

          next[st.id][d] = {
            current: code, pending: null,
            checkIn: sess?.checkIn ?? null, checkOut: sess?.checkOut ?? null,
            worked: sess?.status === 'completed' ? sess.worked : (sess?.checkIn ? 0 : null),
            designated, late, earlyOut, leaveType: lv, hasLeave: !!lv,
          };
        }
      }
      setGrid(next);
      setHasSearched(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load once on first mount
  useEffect(() => { if (canManage) fetchGrid(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canManage]);

  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      if (empSearch && !String(s.employee_id ?? '').toLowerCase().includes(empSearch.toLowerCase())) return false;
      if (nameSearch && !s.full_name.toLowerCase().includes(nameSearch.toLowerCase())) return false;
      if (deptSearch && !(s.department ?? '').toLowerCase().includes(deptSearch.toLowerCase())) return false;
      if (desigSearch && !(s.designation ?? '').toLowerCase().includes(desigSearch.toLowerCase())) return false;
      return true;
    });
  }, [staff, empSearch, nameSearch, deptSearch, desigSearch]);

  const pendingCount = useMemo(() => {
    let n = 0;
    for (const s of Object.values(grid)) for (const c of Object.values(s)) if (c.pending && c.pending !== c.current) n++;
    return n;
  }, [grid]);

  const setCell = (staffId: string, date: string, code: Code) => {
    setGrid((g) => {
      const next = { ...g, [staffId]: { ...(g[staffId] ?? {}) } };
      const cur = next[staffId][date];
      if (!cur) return g;
      next[staffId][date] = { ...cur, pending: code === cur.current ? null : code };
      return next;
    });
  };

  const resetPending = () => {
    setGrid((g) => {
      const next: typeof g = {};
      for (const [sid, days] of Object.entries(g)) {
        next[sid] = {};
        for (const [d, c] of Object.entries(days)) next[sid][d] = { ...c, pending: null };
      }
      return next;
    });
  };

  const saveAll = async () => {
    if (pendingCount === 0) return;
    setSaving(true);
    let ok = 0;
    try {
      const staffById = new Map(staff.map((s) => [s.id, s]));
      for (const [sid, days] of Object.entries(grid)) {
        for (const [date, cell] of Object.entries(days)) {
          if (!cell.pending || cell.pending === cell.current) continue;
          const st = staffById.get(sid);
          if (!st) continue;
          const newCode = cell.pending;

          // Reset the day's sessions. Leave records are only cleared when the new
          // code is NOT 'Leave' (LV keeps the pre-approved leave).
          await supabase.from('attendance_sessions').delete().eq('staff_id', sid).eq('work_date', date);
          if (newCode !== 'LV') {
            await supabase.from('leave_records').delete().eq('staff_id', sid).eq('leave_date', date);
          }

          if (newCode === 'FD' || newCode === 'HD') {
            const worked = newCode === 'FD' ? FULL_DAY_MIN : HALF_DAY_MIN;
            const outMin = 9 * 60 + worked;
            const outHH = pad(Math.floor((outMin % (24 * 60)) / 60));
            const outMM = pad(outMin % 60);
            const { error } = await supabase.from('attendance_sessions').insert({
              staff_id: sid,
              user_id: st.user_id,
              work_date: date,
              check_in_at: `${date}T09:00:00${IST}`,
              check_out_at: `${date}T${outHH}:${outMM}:00${IST}`,
              check_in_photo_url: 'manual',
              worked_minutes: worked,
              status: 'completed',
              source: 'manual',
            });
            if (error) throw error;
            // Ensure roster not marked off
            await supabase.from('staff_roster')
              .upsert({ staff_id: sid, roster_date: date, shift_id: null, is_off: false }, { onConflict: 'staff_id,roster_date' });
          } else if (newCode === 'WO') {
            const { error } = await supabase.from('staff_roster')
              .upsert({ staff_id: sid, roster_date: date, shift_id: null, is_off: true }, { onConflict: 'staff_id,roster_date' });
            if (error) throw error;
          } else if (newCode === 'LV') {
            // Leave — the approved leave is kept (must be assigned beforehand).
            // Just make sure the day isn't marked a week-off.
            await supabase.from('staff_roster')
              .upsert({ staff_id: sid, roster_date: date, shift_id: null, is_off: false }, { onConflict: 'staff_id,roster_date' });
          } else {
            // A — clear roster off if previously set
            await supabase.from('staff_roster')
              .upsert({ staff_id: sid, roster_date: date, shift_id: null, is_off: false }, { onConflict: 'staff_id,roster_date' });
          }
          ok++;
        }
      }
      toast.success(`Saved ${ok} change${ok === 1 ? '' : 's'}`);
      await fetchGrid();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = () => {
    const header = ['Employee ID', 'Employee Name', 'Department', 'Designation', ...dates.map((d) => format(parseISO(d), 'dd-MMM (EEE)'))];
    const rows = filteredStaff.map((s) => {
      const r: (string | number)[] = [s.employee_id ?? '', s.full_name, s.department ?? '', s.designation ?? ''];
      for (const d of dates) {
        const c = grid[s.id]?.[d];
        r.push(c ? (c.pending ?? c.current) : '');
      }
      return r;
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `bulk-attendance-${from}_to_${to}.xlsx`);
  };

  if (!canManage) {
    return <EmptyState icon={ShieldAlert} title="Access Denied" description="You need the “Manage attendance” permission to use bulk adjustments." />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Bulk Attendance Adjustments" description="Edit attendance for many staff across a date range. Changes highlight until you save." />

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">From</label>
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[140px]" />
              </div>
              <ArrowRight className="mb-2 h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">To</label>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-[140px]" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Branch</label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Choose Branch" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={fetchGrid} disabled={loading} className="h-9 gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>

            <div className="ml-auto flex items-end gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9"><Info className="h-4 w-4" /></Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold">Each cell shows the day's punches</p>
                      <p>Check-in → check-out (red = late in / early out), status, and worked vs rostered duration (red if short).</p>
                      <p className="pt-1 font-semibold">Mark codes</p>
                      <p><span className="font-medium">FD</span> Full Day · <span className="font-medium">HD</span> Half Day</p>
                      <p><span className="font-medium">A</span> Absent · <span className="font-medium">WO</span> Week Off</p>
                      <p><span className="font-medium">LV</span> Leave (must be approved first)</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button onClick={saveAll} disabled={saving || pendingCount === 0} className="h-9 gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </Button>
              <Button variant="outline" onClick={exportExcel} className="h-9 gap-1.5" disabled={filteredStaff.length === 0}>
                <FileSpreadsheet className="h-4 w-4" /> Export Excel
              </Button>
              <Button variant="outline" onClick={resetPending} disabled={pendingCount === 0} className="h-9 gap-1.5">
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchGrid} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <Card>
        <CardContent className="p-0">
          {!hasSearched ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Pick a date range and click Search to load the grid.</div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No staff match the current filters.</div>
          ) : (
            <AttendanceGrid
              dates={dates}
              staff={filteredStaff}
              grid={grid}
              onCellChange={setCell}
              empSearch={empSearch} setEmpSearch={setEmpSearch}
              nameSearch={nameSearch} setNameSearch={setNameSearch}
              deptSearch={deptSearch} setDeptSearch={setDeptSearch}
              desigSearch={desigSearch} setDesigSearch={setDesigSearch}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid component
// ---------------------------------------------------------------------------

interface GridProps {
  dates: string[];
  staff: StaffRow[];
  grid: Record<string, Record<string, CellState>>;
  onCellChange: (staffId: string, date: string, code: Code) => void;
  empSearch: string; setEmpSearch: (v: string) => void;
  nameSearch: string; setNameSearch: (v: string) => void;
  deptSearch: string; setDeptSearch: (v: string) => void;
  desigSearch: string; setDesigSearch: (v: string) => void;
}

function AttendanceGrid({
  dates, staff, grid, onCellChange,
  empSearch, setEmpSearch, nameSearch, setNameSearch,
  deptSearch, setDeptSearch, desigSearch, setDesigSearch,
}: GridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayOf = (d: string) => format(parseISO(d), 'EEE');
  const isWeekend = (d: string) => {
    const day = parseISO(d).getDay();
    return day === 0 || day === 6;
  };

  return (
    <div ref={scrollRef} className="relative max-h-[70vh] overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur">
          {/* Group header */}
          <tr>
            <th colSpan={4} className="sticky left-0 z-30 border-b border-r bg-muted/80 px-3 py-2 text-center text-sm font-semibold">
              Employees / Hierarchy
            </th>
            {dates.map((d) => (
              <th key={d} className={cn('border-b border-r px-2 py-1 text-center font-medium', isWeekend(d) && 'bg-muted')}>
                {format(parseISO(d), 'dd-MMM')}
              </th>
            ))}
          </tr>
          {/* Sub header with searches + day-of-week */}
          <tr>
            <th className="sticky left-0 z-30 min-w-[110px] border-b border-r bg-background px-2 py-1.5">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Employee ID</div>
                <Input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Filter" className="h-7 text-xs" />
              </div>
            </th>
            <th className="sticky left-[110px] z-30 min-w-[180px] border-b border-r bg-background px-2 py-1.5">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Employee Name</div>
                <Input value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="Filter" className="h-7 text-xs" />
              </div>
            </th>
            <th className="min-w-[140px] border-b border-r bg-background px-2 py-1.5">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Department</div>
                <Input value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)} placeholder="Filter" className="h-7 text-xs" />
              </div>
            </th>
            <th className="min-w-[150px] border-b border-r bg-background px-2 py-1.5">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Designation</div>
                <Input value={desigSearch} onChange={(e) => setDesigSearch(e.target.value)} placeholder="Filter" className="h-7 text-xs" />
              </div>
            </th>
            {dates.map((d) => (
              <th key={d} className={cn('border-b border-r px-2 py-1 text-center text-[11px] font-medium text-muted-foreground', isWeekend(d) && 'bg-muted')}>
                {dayOf(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="hover:bg-muted/30">
              <td className="sticky left-0 z-10 border-b border-r bg-background px-2 py-1.5 font-mono text-[11px]">
                {s.employee_id || '—'}
              </td>
              <td className="sticky left-[110px] z-10 border-b border-r bg-background px-2 py-1.5 font-medium">
                {s.full_name}
              </td>
              <td className="border-b border-r px-2 py-1.5 text-muted-foreground">{s.department || '—'}</td>
              <td className="border-b border-r px-2 py-1.5 text-muted-foreground">{s.designation || '—'}</td>
              {dates.map((d) => {
                const cell = grid[s.id]?.[d];
                if (!cell) return <td key={d} className="min-w-[104px] border-b border-r" />;
                const display = cell.pending ?? cell.current;
                const isPending = !!cell.pending && cell.pending !== cell.current;
                const problems: string[] = [];
                if (cell.late) problems.push('Late in');
                if (cell.earlyOut) problems.push('Early out');
                if (cell.designated && cell.worked != null && cell.worked < cell.designated - 15) problems.push('Short');
                const short = !!(cell.designated && cell.worked != null && cell.worked < cell.designated);
                return (
                  <td key={d} className={cn('min-w-[104px] border-b border-r p-1 align-top', isWeekend(d) && 'bg-muted/40', isPending && 'bg-amber-100/60 dark:bg-amber-900/30')}>
                    <div className="flex flex-col items-center gap-0.5">
                      {cell.leaveType ? (
                        <span className="max-w-[96px] truncate text-[11px] font-medium text-violet-700 dark:text-violet-400" title={cell.leaveType}>{cell.leaveType}</span>
                      ) : cell.checkIn ? (
                        <>
                          <div className="text-[11px] leading-tight">
                            <span className={cn('font-mono', cell.late && 'font-semibold text-rose-600 dark:text-rose-400')}>{fmtTime(cell.checkIn)}</span>
                            <span className="text-muted-foreground"> → </span>
                            <span className={cn('font-mono', cell.earlyOut && 'font-semibold text-rose-600 dark:text-rose-400')}>{fmtTime(cell.checkOut)}</span>
                          </div>
                          <span className={cn('text-[10px] leading-none', problems.length ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                            {problems.length ? problems.join(' · ') : 'On time'}
                          </span>
                          {cell.worked != null && (
                            <span className={cn('text-[10px] font-medium leading-none', short ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                              {fmtDur(cell.worked)}{cell.designated ? ` / ${fmtDur(cell.designated)}` : ''}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{display === 'WO' ? 'Week off' : 'Absent'}</span>
                      )}
                      <CellSelect value={display} hasLeave={cell.hasLeave} leaveType={cell.leaveType} onChange={(v) => onCellChange(s.id, d, v)} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellSelect({ value, hasLeave, leaveType, onChange }: { value: Code; hasLeave: boolean; leaveType: string | null; onChange: (v: Code) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Code)}>
      <SelectTrigger
        className={cn(
          'h-6 w-[66px] border-transparent bg-transparent px-1 py-0 text-[11px] font-semibold shadow-none hover:border-border focus:ring-1',
          CODE_COLOR[value],
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[160px] bg-popover">
        {CODES.map((c) => (
          <SelectItem key={c} value={c} disabled={c === 'LV' && !hasLeave}>
            <span className={cn('font-semibold', CODE_COLOR[c])}>{c}</span>
            <span className="ml-2 text-xs text-muted-foreground">{c === 'LV' ? (leaveType ?? 'Leave — assign first') : CODE_LABEL[c]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
