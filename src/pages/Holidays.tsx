import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { supabase as anyClient } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarCheck, Plus, Trash2, Loader2, ShieldAlert, Users } from 'lucide-react';
import { toast } from '@/lib/toast';

interface Named { id: string; name: string }
interface HolidayGroup {
  id: string; name: string; from_date: string; to_date: string; is_paid: boolean;
  applies_to: 'all' | 'selected'; department_ids: string[]; outlet_ids: string[]; roles: string[];
}
const ROLES = ['staff', 'accountant', 'admin', 'ca', 'owner'];

export default function Holidays() {
  const { isOwner, isAdmin, isAccountant, isHR, user } = useAuth();
  const canManage = isOwner || isAdmin || isAccountant || isHR;

  const [groups, setGroups] = useState<HolidayGroup[]>([]);
  const [depts, setDepts] = useState<Named[]>([]);
  const [outlets, setOutlets] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [appliesAll, setAppliesAll] = useState(true);
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());
  const [outletSel, setOutletSel] = useState<Set<string>>(new Set());
  const [roleSel, setRoleSel] = useState<Set<string>>(new Set(['staff']));

  const load = async () => {
    setLoading(true);
    const [g, d, o] = await Promise.all([
      anyClient.from('holiday_groups').select('*').order('from_date', { ascending: false }),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
      supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
    ]);
    setGroups((g.data ?? []) as HolidayGroup[]);
    setDepts((d.data ?? []) as Named[]);
    setOutlets((o.data ?? []) as Named[]);
    setLoading(false);
  };
  useEffect(() => { if (canManage) load(); else setLoading(false); }, [canManage]);

  const resetForm = () => {
    setName(''); setFromDate(''); setToDate(''); setIsPaid(true); setAppliesAll(true);
    setDeptSel(new Set()); setOutletSel(new Set()); setRoleSel(new Set(['staff']));
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n);
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!fromDate) { toast.error('Pick a start date'); return; }
    const to = toDate || fromDate;
    if (to < fromDate) { toast.error('End date is before start date'); return; }
    if (!appliesAll && deptSel.size === 0 && outletSel.size === 0 && roleSel.size === 0) {
      toast.error('Pick at least one department, outlet or role — or choose Everyone');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await anyClient.from('holiday_groups').insert({
        name: name.trim(), from_date: fromDate, to_date: to, is_paid: isPaid,
        applies_to: appliesAll ? 'all' : 'selected',
        department_ids: appliesAll ? [] : [...deptSel],
        outlet_ids: appliesAll ? [] : [...outletSel],
        roles: appliesAll ? [] : [...roleSel],
        created_by: user?.id ?? null,
      }).select('id').single();
      if (error) throw error;
      const { data: res, error: rpcErr } = await anyClient.rpc('apply_holiday_group', { _group_id: (data as { id: string }).id });
      if (rpcErr) throw rpcErr;
      const n = (res as { leaves_created?: number } | null)?.leaves_created ?? 0;
      toast.success(`Holiday saved — ${n} staff-day leave(s) auto-assigned.`);
      resetForm();
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save holiday');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g: HolidayGroup) => {
    const { error } = await anyClient.from('holiday_groups').delete().eq('id', g.id);
    if (error) toast.error(error.message);
    else { toast.success('Holiday removed'); load(); }
  };

  const audienceLabel = (g: HolidayGroup) => {
    if (g.applies_to === 'all') return 'Everyone';
    const parts: string[] = [];
    if (g.department_ids?.length) parts.push(`${g.department_ids.length} dept`);
    if (g.outlet_ids?.length) parts.push(`${g.outlet_ids.length} outlet`);
    if (g.roles?.length) parts.push(g.roles.join(', '));
    return parts.join(' · ') || 'Selected';
  };
  const dateLabel = (g: HolidayGroup) =>
    g.from_date === g.to_date
      ? format(new Date(g.from_date + 'T00:00:00'), 'dd MMM yyyy')
      : `${format(new Date(g.from_date + 'T00:00:00'), 'dd MMM')} – ${format(new Date(g.to_date + 'T00:00:00'), 'dd MMM yyyy')}`;

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners, admins and accountants can manage holidays." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Holidays" description="Create a holiday for one day or a period; choose who it applies to. Selected staff are auto-given a paid holiday leave — reflected in the Duty Roster and Bulk Attendance.">
        <Button onClick={() => { resetForm(); setOpen(true); }} className="gap-1.5"><Plus className="h-4 w-4" /> Add holiday</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No holidays yet" description="Add your first holiday — it can cover a single day or a range, for everyone or specific teams." />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <CalendarCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">{dateLabel(g)}</p>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex">
                <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> {audienceLabel(g)}</Badge>
                <Badge variant="outline" className={g.is_paid ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 text-amber-700 dark:text-amber-400'}>{g.is_paid ? 'Paid' : 'Unpaid'}</Badge>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" aria-label="Delete holiday"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove “{g.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>This deletes the holiday and the leaves it auto-assigned to staff for those dates.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(g)}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add holiday</DialogTitle>
            <DialogDescription>One day or a period. Selected staff get an auto paid-holiday leave.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); if (!toDate || toDate < e.target.value) setToDate(e.target.value); }} />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><Label className="text-sm">Paid holiday</Label><p className="text-[10px] text-muted-foreground">No salary deduction for these days</p></div>
              <Switch checked={isPaid} onCheckedChange={setIsPaid} aria-label="Paid holiday" />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Applies to everyone</Label>
                <Switch checked={appliesAll} onCheckedChange={setAppliesAll} aria-label="Applies to everyone" />
              </div>
              {!appliesAll && (
                <div className="space-y-3 pt-1">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Departments</p>
                    <div className="max-h-28 space-y-1 overflow-auto">
                      {depts.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : depts.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 text-sm"><Checkbox checked={deptSel.has(d.id)} onCheckedChange={() => toggle(deptSel, setDeptSel, d.id)} /> {d.name}</label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Outlets</p>
                    <div className="max-h-28 space-y-1 overflow-auto">
                      {outlets.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : outlets.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm"><Checkbox checked={outletSel.has(o.id)} onCheckedChange={() => toggle(outletSel, setOutletSel, o.id)} /> {o.name}</label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Roles</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {ROLES.map((r) => (
                        <label key={r} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={roleSel.has(r)} onCheckedChange={() => toggle(roleSel, setRoleSel, r)} /> {r}</label>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Staff matching <span className="font-medium">any</span> of the chosen departments, outlets or roles get the holiday.</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & assign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
