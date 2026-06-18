import { useEffect, useMemo, useState } from 'react';
import { Check, X, ShieldAlert, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/layout/filter-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { validateEmployeeSelection } from '@/lib/leave-allocation';
import { listLeaveTypes, assignLeaveTypes, listBalances, type LeaveType } from '@/lib/leave-service';

interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null; designation: string | null }

export default function LeaveAssign() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set()); // `staffId:typeId`
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [{ data: st }, tp, bal] = await Promise.all([
        supabase.from('staff').select('id, employee_id, full_name, department, designation').eq('is_active', true).order('full_name'),
        listLeaveTypes(),
        listBalances(),
      ]);
      setStaff((st ?? []) as StaffRow[]);
      setTypes(tp);
      setAssigned(new Set(bal.map((b) => `${b.staff_id}:${b.leave_type_id}`)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShown = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected((p) => {
    const n = new Set(p);
    if (allShown) filtered.forEach((s) => n.delete(s.id));
    else filtered.forEach((s) => n.add(s.id));
    return n;
  });

  const openModal = () => {
    const err = validateEmployeeSelection([...selected]);
    if (err) { toast.error(err); return; }
    setChosen(new Set());
    setModal(true);
  };

  const apply = async () => {
    if (chosen.size === 0) { toast.error('Choose at least one leave type'); return; }
    setSaving(true);
    try {
      const created = await assignLeaveTypes([...selected], [...chosen]);
      toast.success(created > 0 ? `Assigned to ${created} balance(s)` : 'Already assigned — nothing to add');
      setModal(false);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign');
    } finally { setSaving(false); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can assign leave types." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Leave Assign" description="Grant leave types to employees (bulk).">
        <Button onClick={openModal} disabled={selected.size === 0} className="gap-1.5"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Bulk Assign</span> ({selected.size})</Button>
      </PageHeader>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff…" />

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60">
                <TableHead className="w-10"><Checkbox checked={allShown} onCheckedChange={toggleAll} aria-label="Select all" /></TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                {types.map((t) => <TableHead key={t.id} className="text-center whitespace-nowrap">{t.code}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5 + types.length} className="p-0"><EmptyState icon={UserPlus} title="No staff" description="No active staff to assign." /></TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id} className="even:bg-muted/30">
                  <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={`Select ${s.full_name}`} /></TableCell>
                  <TableCell className="text-sm">{s.employee_id}</TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.department || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.designation || '—'}</TableCell>
                  {types.map((t) => (
                    <TableCell key={t.id} className="text-center">
                      {assigned.has(`${s.id}:${t.id}`)
                        ? <Check className="h-4 w-4 text-success mx-auto" />
                        : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Choose Leave To Assign</DialogTitle>
            <DialogDescription>Creates balances (initialised to 0) for {selected.size} selected employee(s). Existing balances are left untouched.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1 max-h-72 overflow-y-auto">
            {types.map((t) => (
              <label key={t.id} className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer">
                <Checkbox checked={chosen.has(t.id)} onCheckedChange={() => setChosen((p) => { const n = new Set(p); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })} />
                <span className="text-sm font-medium">{t.name}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{t.code}</Badge>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={apply} disabled={saving}>{saving ? 'Applying…' : 'Apply'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
