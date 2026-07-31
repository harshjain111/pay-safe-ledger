import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, CalendarOff, Loader2, Save, CalendarCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FilterBar } from '@/components/layout/filter-bar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { listWeekOff, saveWeekOff } from '@/lib/shift-roster-service';
import type { WeekOffState } from '@/lib/shift-roster';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NONE = 'none';
interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null }

export default function WeekOff() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  // staff_id -> weekly off weekday (0-6) or null (no weekly off)
  const [offDay, setOffDay] = useState<Map<string, number | null>>(new Map());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [defaultDay, setDefaultDay] = useState<string>('0'); // Sunday

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
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const setStaffOff = (sid: string, val: string) => {
    const day = val === NONE ? null : Number(val);
    setOffDay((p) => new Map(p).set(sid, day));
    setDirty((p) => new Set(p).add(sid));
  };

  const applyDefaultToAll = () => {
    const day = Number(defaultDay);
    setOffDay((p) => { const n = new Map(p); for (const s of filtered) n.set(s.id, day); return n; });
    setDirty((p) => { const n = new Set(p); for (const s of filtered) n.add(s.id); return n; });
    toast.success(`${DAYS[day]} set as the weekly off for ${filtered.length} staff — review and Save.`);
  };

  const save = async () => {
    if (dirty.size === 0) { toast.message('No changes'); return; }
    setSaving(true);
    try {
      // For each changed staff, write all 7 weekdays (picked day = WEEK_OFF).
      const rows: { staff_id: string; weekday: number; state: WeekOffState }[] = [];
      for (const sid of dirty) {
        const day = offDay.get(sid) ?? null;
        for (let wd = 0; wd < 7; wd++) rows.push({ staff_id: sid, weekday: wd, state: (day === wd ? 'WEEK_OFF' : 'WORKING') });
      }
      await saveWeekOff(rows); // also dual-writes staff.weekly_off_day
      toast.success(`Saved weekly off for ${dirty.size} staff.`);
      setDirty(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can set week-offs." />;

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

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarOff} title="No staff" description="No active staff match your search." />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {filtered.map((s) => {
            const day = offDay.get(s.id);
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.employee_id}{s.department ? ` · ${s.department}` : ''}</p>
                </div>
                <Select value={day == null ? NONE : String(day)} onValueChange={(v) => setStaffOff(s.id, v)}>
                  <SelectTrigger className={`w-40 ${dirty.has(s.id) ? 'border-primary' : ''}`}>
                    <SelectValue placeholder="No weekly off" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No weekly off</SelectItem>
                    {DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
