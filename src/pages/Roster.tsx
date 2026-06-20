import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth, addDays, differenceInCalendarDays } from 'date-fns';
import { Loader2, CalendarDays, ShieldAlert, Save, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FilterBar } from '@/components/layout/filter-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { listShifts, buildRosterGrid, saveRosterCells, type ShiftRow } from '@/lib/shift-roster-service';
import type { RosterStatus } from '@/lib/shift-roster';
import { exportSheetsToExcel } from '@/lib/report-export';

const ALL = '__all__';
const NONE = 'NONE', WEEK_OFF = 'WEEK_OFF', OPEN = 'OPEN';
const MAX_DAYS = 31;
const key = (sid: string, date: string) => `${sid}:${date}`;
interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null; designation: string | null; outlet_id: string | null }

/** Roster cell {shift_id,status} → the Select's string value. */
function toValue(shiftId: string | null, status: RosterStatus | null): string {
  if (status === null) return NONE;
  if (status === 'OFF') return WEEK_OFF;
  return shiftId ?? OPEN; // SCHEDULED / AUTO_PRESENT
}
/** Select value → {shift_id,status} for persistence. */
function fromValue(v: string): { shift_id: string | null; status: RosterStatus | null } {
  if (v === NONE) return { shift_id: null, status: null };
  if (v === WEEK_OFF) return { shift_id: null, status: 'OFF' };
  if (v === OPEN) return { shift_id: null, status: 'SCHEDULED' };
  return { shift_id: v, status: 'SCHEDULED' };
}

export default function Roster() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [branch, setBranch] = useState(ALL);
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [grid, setGrid] = useState<Map<string, string>>(new Map());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const dates = useMemo(() => {
    try {
      const span = differenceInCalendarDays(parseISO(to), parseISO(from));
      if (span < 0) return [];
      const end = span > MAX_DAYS ? addDays(parseISO(from), MAX_DAYS) : parseISO(to);
      return eachDayOfInterval({ start: parseISO(from), end }).map((d) => format(d, 'yyyy-MM-dd'));
    } catch { return []; }
  }, [from, to]);

  useEffect(() => {
    if (!canManage) return;
    supabase.from('outlets').select('id, name').eq('is_active', true).order('name').then(({ data }) => setOutlets((data ?? []) as { id: string; name: string }[]));
    listShifts().then(setShifts);
  }, [canManage]);

  const load = async () => {
    if (dates.length === 0) { toast.error('Pick a valid date range'); return; }
    if (differenceInCalendarDays(parseISO(to), parseISO(from)) > MAX_DAYS) toast.message(`Showing the first ${MAX_DAYS} days of the range`);
    setLoading(true);
    try {
      let q = supabase.from('staff').select('id, employee_id, full_name, department, designation, outlet_id').eq('is_active', true).order('full_name');
      if (branch !== ALL) q = q.eq('outlet_id', branch);
      const { data: st } = await q;
      const rows = (st ?? []) as StaffRow[];
      setStaff(rows);
      const cells = await buildRosterGrid(rows.map((r) => r.id), dates[0], dates[dates.length - 1]);
      const g = new Map<string, string>();
      cells.forEach((c, k) => g.set(k, toValue(c.shift_id, c.status)));
      setGrid(g); setDirty(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (canManage) load(); }, [canManage]);

  const filtered = useMemo(() => {
    const qs = search.trim().toLowerCase();
    return qs ? staff.filter((s) => s.full_name.toLowerCase().includes(qs) || s.employee_id.toLowerCase().includes(qs)) : staff;
  }, [staff, search]);

  const cellVal = (sid: string, date: string): string => grid.get(key(sid, date)) ?? NONE;
  const setCell = (sid: string, date: string, v: string) => {
    setGrid((p) => new Map(p).set(key(sid, date), v));
    setDirty((p) => new Set(p).add(key(sid, date)));
  };
  const cellColor = (v: string): string | undefined => {
    if (v === WEEK_OFF) return '#f59e0b22';
    if (v === OPEN) return '#64748b22';
    if (v === NONE) return undefined;
    return `${shiftById.get(v)?.color ?? '#3b82f6'}22`;
  };
  const cellLabel = (v: string): string => {
    if (v === NONE) return '';
    if (v === WEEK_OFF) return 'Week Off';
    if (v === OPEN) return 'Open Shift';
    return shiftById.get(v)?.name ?? '';
  };

  const save = async () => {
    if (dirty.size === 0) { toast.message('No changes'); return; }
    setSaving(true);
    try {
      const rows = [...dirty].map((k) => { const [staff_id, date] = k.split(':'); return { staff_id, date, ...fromValue(grid.get(k) ?? NONE) }; });
      await saveRosterCells(rows);
      toast.success(`Saved ${rows.length} change(s)`);
      setDirty(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  const exportExcel = () => {
    const headers = ['Code', 'Name', 'Department', 'Designation', ...dates.map((d) => format(parseISO(d), 'dd MMM (EEE)'))];
    const rows = filtered.map((s) => [s.employee_id, s.full_name, s.department ?? '', s.designation ?? '', ...dates.map((d) => cellLabel(cellVal(s.id, d)))]);
    exportSheetsToExcel('Roster', [{ name: 'Roster', headers, rows }]);
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can manage the roster." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Roster" description="Date-specific schedule. Only scheduled people are rostered — anyone not rostered is treated as off (a check-in auto-adds them).">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={!staff.length} className="gap-1.5"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button onClick={save} disabled={saving || dirty.size === 0} className="gap-1.5"><Save className="h-4 w-4" /> Save{dirty.size ? ` (${dirty.size})` : ''}</Button>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <div className="space-y-1">
          <Label className="text-xs">Branch</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover"><SelectItem value={ALL}>All branches</SelectItem>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}</Button>
      </div>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff…" />

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : filtered.length === 0 ? <EmptyState icon={CalendarDays} title="No roster" description="Pick a date range and Load." />
        : (
          <div className="rounded-xl border overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60">
                  <TableHead className="sticky left-0 bg-secondary/60 z-10">Code</TableHead>
                  <TableHead className="sticky left-[60px] bg-secondary/60 z-10">Name</TableHead>
                  <TableHead>Department</TableHead><TableHead>Designation</TableHead>
                  {dates.map((d) => <TableHead key={d} className="text-center text-[10px] whitespace-nowrap leading-tight">{format(parseISO(d), 'dd')}<br />{format(parseISO(d), 'EEE')}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="even:bg-muted/30">
                    <TableCell className="sticky left-0 bg-card text-sm z-10">{s.employee_id}</TableCell>
                    <TableCell className="sticky left-[60px] bg-card font-medium whitespace-nowrap z-10">{s.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.department || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.designation || '—'}</TableCell>
                    {dates.map((d) => {
                      const v = cellVal(s.id, d);
                      return (
                        <TableCell key={d} className="p-1" style={{ backgroundColor: cellColor(v) }}>
                          <Select value={v} onValueChange={(nv) => setCell(s.id, d, nv)}>
                            <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-popover">
                              <SelectItem value={NONE}>—</SelectItem>
                              <SelectItem value={WEEK_OFF}>Week Off</SelectItem>
                              <SelectItem value={OPEN}>Open Shift</SelectItem>
                              {shifts.map((sh) => <SelectItem key={sh.id} value={sh.id}>{sh.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
    </div>
  );
}
