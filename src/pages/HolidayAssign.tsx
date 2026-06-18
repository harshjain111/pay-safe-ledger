import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, CalendarCheck2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/layout/filter-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { validateEmployeeSelection, validateHolidayTemplateExists } from '@/lib/leave-allocation';
import { listTemplates, listAssignments, assignTemplate, type TemplateSummary } from '@/lib/holiday-service';

interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null; designation: string | null }

export default function HolidayAssign() {
  const { isOwner, isAdmin, user } = useAuth();
  const canManage = isOwner || isAdmin;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [assignedBy, setAssignedBy] = useState<Map<string, string>>(new Map()); // staffId -> templateId
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [{ data: st }, tps, assigns] = await Promise.all([
        supabase.from('staff').select('id, employee_id, full_name, department, designation').eq('is_active', true).order('full_name'),
        listTemplates(),
        listAssignments(),
      ]);
      setStaff((st ?? []) as StaffRow[]);
      setTemplates(tps);
      setAssignedBy(new Map(assigns.map((a) => [a.staff_id, a.template_id])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const templateName = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShown = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected((p) => {
    const n = new Set(p);
    if (allShown) filtered.forEach((s) => n.delete(s.id)); else filtered.forEach((s) => n.add(s.id));
    return n;
  });

  const assign = async () => {
    const guard = validateHolidayTemplateExists(templates.length);
    if (guard) { toast.error(guard); return; }
    const selErr = validateEmployeeSelection([...selected]);
    if (selErr) { toast.error(selErr); return; }
    if (!picked) { toast.error('Choose a template'); return; }
    setSaving(true);
    try {
      await assignTemplate([...selected], picked, user?.id ?? null);
      toast.success(`Template assigned to ${selected.size} employee(s)`);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign');
    } finally { setSaving(false); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can assign holiday templates." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Holiday Assign" description="Assign a holiday template to employees (one active template each).">
        <div className="flex items-center gap-2">
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="w-44"><SelectValue placeholder={templates.length ? 'Choose template' : 'No templates'} /></SelectTrigger>
            <SelectContent className="bg-popover">{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={assign} disabled={selected.size === 0 || saving} className="gap-1.5">Assign ({selected.size})</Button>
        </div>
      </PageHeader>

      {templates.length === 0 && !loading && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          Please create a holiday template first.
        </div>
      )}

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff…" />

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60">
                <TableHead className="w-10"><Checkbox checked={allShown} onCheckedChange={toggleAll} aria-label="Select all" /></TableHead>
                <TableHead>Employee ID</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead>
                <TableHead>Designation</TableHead><TableHead>Template Assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="p-0"><EmptyState icon={CalendarCheck2} title="No staff" description="No active staff." /></TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id} className="even:bg-muted/30">
                  <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={`Select ${s.full_name}`} /></TableCell>
                  <TableCell className="text-sm">{s.employee_id}</TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.department || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.designation || '—'}</TableCell>
                  <TableCell>{assignedBy.has(s.id) ? <Badge variant="secondary" className="text-[11px]">{templateName.get(assignedBy.get(s.id)!) ?? '—'}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
