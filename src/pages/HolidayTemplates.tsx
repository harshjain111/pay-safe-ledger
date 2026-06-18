import { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Plus, Pencil, Trash2, ShieldAlert, CalendarCheck2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import {
  listTemplates, getTemplateDays, saveTemplate, deleteTemplate,
  type TemplateSummary, type HolidayDay,
} from '@/lib/holiday-service';

const dayLabel = (d: HolidayDay): string => {
  const s = parseISO(d.start_date), e = parseISO(d.end_date);
  if (!isValid(s)) return '—';
  if (d.start_date === d.end_date || !isValid(e)) return format(s, 'EEE');
  return `${format(s, 'EEE')}–${format(e, 'EEE')}`;
};
const dateLabel = (d: HolidayDay): string => {
  const s = parseISO(d.start_date);
  if (!isValid(s)) return d.start_date;
  return d.start_date === d.end_date ? format(s, 'dd MMM yyyy') : `${format(s, 'dd MMM')} → ${format(parseISO(d.end_date), 'dd MMM yyyy')}`;
};

function TemplateBuilder({ open, onOpenChange, editingId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editingId: string | null; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [days, setDays] = useState<HolidayDay[]>([]);
  const [hName, setHName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(''); setDays([]); setHName(''); setStart(''); setEnd('');
    if (editingId) {
      listTemplates().then((ts) => setName(ts.find((t) => t.id === editingId)?.name ?? ''));
      getTemplateDays(editingId).then(setDays).catch(() => {});
    }
  }, [open, editingId]);

  const addHoliday = () => {
    if (!hName.trim()) { toast.error('Holiday name is required'); return; }
    if (!start) { toast.error('Start date is required'); return; }
    const endDate = end || start;
    if (endDate < start) { toast.error('End date cannot be before the start date'); return; }
    setDays((d) => [...d, { name: hName.trim(), start_date: start, end_date: endDate }]);
    setHName(''); setStart(''); setEnd('');
  };

  const submit = async () => {
    if (!name.trim()) { toast.error('Template Name is required'); return; }
    if (days.length === 0) { toast.error('Add at least one holiday'); return; }
    setSaving(true);
    try {
      await saveTemplate({ id: editingId ?? undefined, name: name.trim(), days, userId: user?.id ?? null });
      toast.success(editingId ? 'Template updated' : 'Template created');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save template');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit Holiday Template' : 'Create Holiday Template'}</DialogTitle>
          <DialogDescription>Add holidays (single or multi-day ranges); the Day is derived from the date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-1.5"><Label className="text-xs">Template Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2026 Public Holidays" /></div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">Add Holiday</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Name</Label><Input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. Diwali" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">End</Label><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <Button size="sm" variant="outline" onClick={addHoliday} className="gap-1.5"><Plus className="h-4 w-4" /> Add</Button>
          </div>

          {days.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-secondary/60"><TableHead>Date</TableHead><TableHead>Day</TableHead><TableHead>Name</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                <TableBody>
                  {days.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm whitespace-nowrap">{dateLabel(d)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{dayLabel(d)}</TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Remove" onClick={() => setDays((arr) => arr.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function HolidayTemplates() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [rows, setRows] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    listTemplates().then(setRows).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false));
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const remove = async (r: TemplateSummary) => {
    try { await deleteTemplate(r.id); toast.success('Template deleted'); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can manage holiday templates." />;

  const columns: DataTableColumn<TemplateSummary>[] = [
    { id: 'name', header: 'Template Name', sortable: true, sortAccessor: (r) => r.name, cellClassName: 'font-medium', cell: (r) => r.name },
    { id: 'count', header: 'Holiday Count', align: 'right', cell: (r) => <Badge variant="secondary">{r.holidayCount}</Badge> },
    { id: 'assigned', header: 'Assigned Employees', align: 'right', cell: (r) => r.assignedCount },
    { id: 'created', header: 'Created On', sortable: true, sortAccessor: (r) => new Date(r.created_at), cell: (r) => format(new Date(r.created_at), 'dd MMM yyyy') },
    { id: 'modified', header: 'Last Modified', cell: (r) => format(new Date(r.updated_at), 'dd MMM yyyy') },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Holiday Templates" description="Master of holiday templates — each a named bundle of holidays.">
        <Button onClick={() => { setEditingId(null); setOpen(true); }} className="gap-1.5"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New template</span></Button>
      </PageHeader>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        isLoading={loading}
        initialSort={{ columnId: 'created', direction: 'desc' }}
        rowActions={(r) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => { setEditingId(r.id); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Delete {r.name}?</AlertDialogTitle><AlertDialogDescription>Its holidays and any employee assignments are removed.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(r)}>Delete</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        actionsHeader="Actions"
        emptyState={<EmptyState icon={CalendarCheck2} title="No templates" description="Create a holiday template to assign to employees." />}
      />

      <TemplateBuilder open={open} onOpenChange={setOpen} editingId={editingId} onSaved={reload} />
    </div>
  );
}
