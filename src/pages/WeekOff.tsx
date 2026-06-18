import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, CalendarOff, Loader2, Save, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterBar } from '@/components/layout/filter-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { listWeekOff, saveWeekOff } from '@/lib/shift-roster-service';
import type { WeekOffState } from '@/lib/shift-roster';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NEXT: Record<WeekOffState, WeekOffState> = { WORKING: 'WEEK_OFF', WEEK_OFF: 'OCCASIONAL_WEEK_OFF', OCCASIONAL_WEEK_OFF: 'WORKING' };
const key = (sid: string, wd: number) => `${sid}:${wd}`;
interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null }

function StateCell({ state, onClick }: { state: WeekOffState; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mx-auto flex h-7 w-12 items-center justify-center rounded-md border hover:bg-muted" aria-label={state}>
      {state === 'WORKING' && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
      {state === 'WEEK_OFF' && <span className="text-[11px] font-semibold text-amber-600">WO</span>}
      {state === 'OCCASIONAL_WEEK_OFF' && <span className="text-orange-500 text-xs">▲</span>}
    </button>
  );
}

export default function WeekOff() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [grid, setGrid] = useState<Map<string, WeekOffState>>(new Map());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pattern, setPattern] = useState<WeekOffState[]>(Array(7).fill('WORKING'));

  const reload = async () => {
    setLoading(true);
    try {
      const [{ data: st }, wo] = await Promise.all([
        supabase.from('staff').select('id, employee_id, full_name, department').eq('is_active', true).order('full_name'),
        listWeekOff(),
      ]);
      setStaff((st ?? []) as StaffRow[]);
      setGrid(new Map(wo.map((w) => [key(w.staff_id, w.weekday), w.state])));
      setDirty(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const stateOf = (sid: string, wd: number): WeekOffState => grid.get(key(sid, wd)) ?? 'WORKING';
  const cycle = (sid: string, wd: number) => {
    const k = key(sid, wd);
    setGrid((p) => { const n = new Map(p); n.set(k, NEXT[stateOf(sid, wd)]); return n; });
    setDirty((p) => new Set(p).add(k));
  };
  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyBulk = () => {
    if (selected.size === 0) { toast.error('Please select at least one employee.'); return; }
    setGrid((p) => {
      const n = new Map(p);
      const d = new Set(dirty);
      for (const sid of selected) for (let wd = 0; wd < 7; wd++) { const k = key(sid, wd); n.set(k, pattern[wd]); d.add(k); }
      setDirty(d);
      return n;
    });
    setBulkOpen(false);
    toast.success(`Pattern applied to ${selected.size} employee(s)`);
  };

  const save = async () => {
    if (dirty.size === 0) { toast.message('No changes'); return; }
    setSaving(true);
    try {
      const rows = [...dirty].map((k) => { const [staff_id, wd] = k.split(':'); return { staff_id, weekday: Number(wd), state: grid.get(k) ?? 'WORKING' as WeekOffState }; });
      await saveWeekOff(rows);
      toast.success(`Saved ${rows.length} change(s)`);
      setDirty(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can set week-offs." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Week Off" description="Recurring weekly off pattern. Click a cell to cycle Working → WO → Occasional.">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setPattern(Array(7).fill('WORKING')); setBulkOpen(true); }} className="gap-1.5"><Layers className="h-4 w-4" /> Bulk Update ({selected.size})</Button>
          <Button onClick={save} disabled={saving || dirty.size === 0} className="gap-1.5"><Save className="h-4 w-4" /> Save{dirty.size ? ` (${dirty.size})` : ''}</Button>
        </div>
      </PageHeader>
      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff…" />

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60">
                <TableHead className="w-10" />
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead>
                {WEEKDAYS.map((d) => <TableHead key={d} className="text-center">{d}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4 + 7} className="p-0"><EmptyState icon={CalendarOff} title="No staff" description="No active staff." /></TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id} className="even:bg-muted/30">
                  <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSel(s.id)} aria-label={`Select ${s.full_name}`} /></TableCell>
                  <TableCell className="text-sm">{s.employee_id}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{s.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.department || '—'}</TableCell>
                  {WEEKDAYS.map((_, wd) => <TableCell key={wd} className="p-1"><StateCell state={stateOf(s.id, wd)} onClick={() => cycle(s.id, wd)} /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Update Week Off</DialogTitle>
            <DialogDescription>Set a weekly pattern, then apply it to the {selected.size} selected employee(s). Click each day to cycle.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-between gap-1 py-2">
            {WEEKDAYS.map((d, wd) => (
              <div key={d} className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-muted-foreground">{d}</span>
                <StateCell state={pattern[wd]} onClick={() => setPattern((p) => p.map((v, i) => (i === wd ? NEXT[v] : v)))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={applyBulk}>Apply to {selected.size}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
