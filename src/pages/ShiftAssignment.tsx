import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, CalendarRange, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/layout/filter-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { listShifts, listShiftAssignments, saveShiftAssignments, type ShiftRow } from '@/lib/shift-roster-service';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NONE = '__none__';
const key = (sid: string, wd: number) => `${sid}:${wd}`;
interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null; designation: string | null }

export default function ShiftAssignment() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [grid, setGrid] = useState<Map<string, string>>(new Map()); // key -> shiftId
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const [{ data: st }, sh, asn] = await Promise.all([
        supabase.from('staff').select('id, employee_id, full_name, department, designation').eq('is_active', true).order('full_name'),
        listShifts(),
        listShiftAssignments(),
      ]);
      setStaff((st ?? []) as StaffRow[]);
      setShifts(sh);
      setGrid(new Map(asn.filter((a) => a.shift_id).map((a) => [key(a.staff_id, a.weekday), a.shift_id as string])));
      setDirty(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const setCell = (sid: string, wd: number, shiftId: string) => {
    const k = key(sid, wd);
    setGrid((p) => { const n = new Map(p); if (shiftId === NONE) n.delete(k); else n.set(k, shiftId); return n; });
    setDirty((p) => new Set(p).add(k));
  };

  const save = async () => {
    if (dirty.size === 0) { toast.message('No changes'); return; }
    setSaving(true);
    try {
      const rows = [...dirty].map((k) => {
        const [staff_id, wd] = k.split(':');
        return { staff_id, weekday: Number(wd), shift_id: grid.get(k) ?? null };
      });
      await saveShiftAssignments(rows);
      toast.success(`Saved ${rows.length} change(s)`);
      setDirty(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can set shift assignments." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Shift Assignment" description="Recurring weekly shift per employee per weekday.">
        <Button onClick={save} disabled={saving || dirty.size === 0} className="gap-1.5"><Save className="h-4 w-4" /> Save{dirty.size ? ` (${dirty.size})` : ''}</Button>
      </PageHeader>
      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff…" />

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60">
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>Designation</TableHead>
                {WEEKDAYS.map((d) => <TableHead key={d} className="text-center">{d}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4 + 7} className="p-0"><EmptyState icon={CalendarRange} title="No staff" description="No active staff." /></TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id} className="even:bg-muted/30">
                  <TableCell className="text-sm">{s.employee_id}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{s.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.department || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.designation || '—'}</TableCell>
                  {WEEKDAYS.map((_, wd) => (
                    <TableCell key={wd} className="p-1">
                      <Select value={grid.get(key(s.id, wd)) ?? NONE} onValueChange={(v) => setCell(s.id, wd, v)}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover">
                          <SelectItem value={NONE}>—</SelectItem>
                          {shifts.map((sh) => <SelectItem key={sh.id} value={sh.id}>{sh.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
