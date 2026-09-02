import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, CalendarOff, Loader2, Save, CalendarCheck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterBar } from '@/components/layout/filter-bar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { listWeekOff, saveWeekOff } from '@/lib/shift-roster-service';
import type { WeekOffState } from '@/lib/shift-roster';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NONE = 'none';
interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null }

export default function WeekOff() {
  const { isOwner, isAdmin, isHR } = useAuth();
  const canManage = isOwner || isAdmin || isHR;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  // staff_id -> weekly off weekday (0-6) or null (no weekly off)
  const [offDay, setOffDay] = useState<Map<string, number | null>>(new Map());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [search, setSearch] = useState('');
  const [defaultDay, setDefaultDay] = useState<string>('0'); // Sunday
  const [bulkDay, setBulkDay] = useState<string>('0');

  const reload = async () => {
    setLoading(true);
    try {
      const [{ data: st }, wo] = await Promise.all([
        supabase.from('staff').select('id, employee_id, full_name, department').eq('is_active', true).order('full_name'),
        listWeekOff(),
      ]);
      setStaff((st ?? []) as StaffRow[]);
      // Each staff's off day = the first weekday flagged WEEK_OFF.
      const m = new Map<string, number | null>();
      for (const w of wo) {
        if (w.state === 'WEEK_OFF' && m.get(w.staff_id) == null) m.set(w.staff_id, w.weekday);
      }
      setOffDay(m);
      setDirty(new Set());
      setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const allShownSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const setStaffOff = (sid: string, val: string) => {
    const day = val === NONE ? null : Number(val);
    setOffDay((p) => new Map(p).set(sid, day));
    setDirty((p) => new Set(p).add(sid));
  };

  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelected((p) => {
    const n = new Set(p);
    if (filtered.every((s) => n.has(s.id))) for (const s of filtered) n.delete(s.id);
    else for (const s of filtered) n.add(s.id);
    return n;
  });

  const applyToStaff = (ids: string[], val: string, label: string) => {
    const day = val === NONE ? null : Number(val);
    setOffDay((p) => { const n = new Map(p); for (const id of ids) n.set(id, day); return n; });
    setDirty((p) => { const n = new Set(p); for (const id of ids) n.add(id); return n; });
    toast.success(`${day == null ? 'No weekly off' : DAYS[day]} set for ${ids.length} ${label} — review and Save.`);
  };

  const applyDefaultToAll = () => applyToStaff(filtered.map((s) => s.id), defaultDay, search ? 'shown staff' : 'staff');
  const applyBulkToSelected = () => {
    if (selected.size === 0) return;
    applyToStaff([...selected], bulkDay, 'selected staff');
    setSelected(new Set());
  };

  const save = () => {
    if (dirty.size === 0) { toast.message('No changes'); return; }
    // PHASE 0: a bulk weekly-off change alters how absences deduct for everyone
    // touched — confirm with the exact count before writing anything.
    setConfirmSave(true);
  };

  const doSave = async () => {
    const changedCount = dirty.size;
    setSaving(true);
    try {
      // For each changed staff, write all 7 weekdays (picked day = WEEK_OFF).
      const rows: { staff_id: string; weekday: number; state: WeekOffState }[] = [];
      const changes: { staff_id: string; weekly_off_day: number | null }[] = [];
      for (const sid of dirty) {
        const day = offDay.get(sid) ?? null;
        changes.push({ staff_id: sid, weekly_off_day: day });
        for (let wd = 0; wd < 7; wd++) rows.push({ staff_id: sid, weekday: wd, state: (day === wd ? 'WEEK_OFF' : 'WORKING') });
      }
      await saveWeekOff(rows); // also dual-writes staff.weekly_off_day

      // Audit the bulk change (SECURITY DEFINER RPC; the staff table itself has
      // no audit trigger, and this is a pay-affecting change).
      try {
        await supabase.rpc('log_bulk_attendance_adjustment', {
          _action: 'weekly_off_bulk_update',
          _scope: { staff_count: changedCount, changes },
        });
      } catch (auditErr) {
        console.error('Failed to write week-off audit entry:', auditErr);
      }

      toast.success(`Saved weekly off for ${changedCount} staff.`);
      setDirty(new Set());
      setConfirmSave(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can set week-offs." />;

  const dayPicker = (value: string, onChange: (v: string) => void, className = 'w-40') => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder="No weekly off" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No weekly off</SelectItem>
        {DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Weekly Off" description="Each person's recurring day off. Change a specific date instead from the Roster.">
        <Button onClick={save} disabled={saving || dirty.size === 0} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save{dirty.size ? ` (${dirty.size})` : ''}
        </Button>
      </PageHeader>

      {/* Default for everyone */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Default weekly off for everyone</span>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Select value={defaultDay} onValueChange={setDefaultDay}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={applyDefaultToAll}>Apply to all{search ? ' shown' : ''}</Button>
          </div>
        </CardContent>
      </Card>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff…" />

      {/* Bulk assign to a hand-picked selection */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-xl border border-primary bg-primary/10 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2 sm:ml-auto">
            {dayPicker(bulkDay, setBulkDay)}
            <Button onClick={applyBulkToSelected}>Assign to {selected.size}</Button>
            <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())} aria-label="Clear selection"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarOff} title="No staff" description="No active staff match your search." />
      ) : (
        <div className="rounded-xl border bg-card">
          {/* Select-all header */}
          <div className="flex items-center gap-3 border-b bg-secondary/40 px-3 py-2 sm:px-4">
            <Checkbox checked={allShownSelected} onCheckedChange={toggleSelectAll} aria-label="Select all shown" />
            <span className="text-xs font-medium text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : `Select all (${filtered.length})`}
            </span>
          </div>
          <div className="divide-y">
            {filtered.map((s) => {
              const day = offDay.get(s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSel(s.id)} aria-label={`Select ${s.full_name}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.employee_id}{s.department ? ` · ${s.department}` : ''}</p>
                  </div>
                  {dayPicker(day == null ? NONE : String(day), (v) => setStaffOff(s.id, v), `w-40 ${dirty.has(s.id) ? 'border-primary' : ''}`)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={confirmSave} onOpenChange={(open) => !open && !saving && setConfirmSave(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change weekly off for {dirty.size} staff?</AlertDialogTitle>
            <AlertDialogDescription>
              This updates the weekly off for {dirty.size} staff member{dirty.size === 1 ? '' : 's'}. Weekly offs
              decide which days count as paid offs and which absences are deducted from salary. The change is
              recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Go Back</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); doSave(); }}>
              {saving ? 'Saving…' : 'Proceed'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
