import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, Pencil, Trash2, CalendarDays, List, Search, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState } from '@/components/layout/ErrorState';
import { toast } from '@/lib/toast';
import { useHolidays, type HolidayWithAssignments, type HolidayInput, type HolidayTargets, type HolidayType } from '@/hooks/useHolidays';
import { expandHolidaysInRange } from '@/lib/holidays';

interface Option { id: string; name: string }
interface StaffOption { id: string; full_name: string; outlet_id: string | null }

const TYPE_LABEL: Record<HolidayType, string> = { public: 'Public', optional: 'Optional', restricted: 'Restricted' };

function TypeBadge({ type }: { type: HolidayType }) {
  const cls =
    type === 'public'
      ? 'border-violet-300 text-violet-700 dark:text-violet-400'
      : type === 'optional'
      ? 'border-amber-300 text-amber-700 dark:text-amber-400'
      : 'border-sky-300 text-sky-700 dark:text-sky-400';
  return <Badge variant="outline" className={cls}>{TYPE_LABEL[type]}</Badge>;
}

// ---- create / edit dialog --------------------------------------------------
function HolidayDialog({
  open, onOpenChange, editing, outlets, staffList, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: HolidayWithAssignments | null;
  outlets: Option[];
  staffList: StaffOption[];
  onSave: (input: HolidayInput, targets: HolidayTargets) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState<HolidayType>('public');
  const [isPaid, setIsPaid] = useState(true);
  const [recurring, setRecurring] = useState(false);
  const [orgWide, setOrgWide] = useState(true);
  const [outletIds, setOutletIds] = useState<Set<string>>(new Set());
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name); setDate(editing.date); setType(editing.type);
      setIsPaid(editing.is_paid); setRecurring(editing.recurring_yearly); setOrgWide(editing.org_wide);
      setOutletIds(new Set(editing.outletIds)); setStaffIds(new Set(editing.staffIds)); setNote(editing.note ?? '');
    } else {
      setName(''); setDate(format(new Date(), 'yyyy-MM-dd')); setType('public');
      setIsPaid(true); setRecurring(false); setOrgWide(true);
      setOutletIds(new Set()); setStaffIds(new Set()); setNote('');
    }
    setStaffSearch('');
  }, [open, editing]);

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    apply(next);
  };

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return q ? staffList.filter((s) => s.full_name.toLowerCase().includes(q)) : staffList;
  }, [staffList, staffSearch]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!date) { toast.error('Date is required'); return; }
    if (!orgWide && outletIds.size === 0 && staffIds.size === 0) {
      toast.error('Pick at least one branch or staff member, or make it org-wide');
      return;
    }
    setSaving(true);
    try {
      await onSave(
        { name: name.trim(), date, type, is_paid: isPaid, recurring_yearly: recurring, org_wide: orgWide, note: note.trim() || null },
        { outletIds: [...outletIds], staffIds: [...staffIds] },
      );
      toast.success(editing ? 'Holiday updated' : 'Holiday created');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save holiday');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
          <DialogDescription>Mandatory (public) paid holidays are paid non-working days; optional &amp; restricted are shown but not auto-applied.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Republic Day" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as HolidayType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="public">Public (mandatory)</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-3">
              <Label className="text-sm">Paid holiday</Label>
              <p className="text-[10px] text-muted-foreground">Paid non-working day; working it earns comp-off / OT</p>
            </div>
            <Switch checked={isPaid} onCheckedChange={setIsPaid} aria-label="Paid holiday" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-3">
              <Label className="text-sm">Repeats every year</Label>
              <p className="text-[10px] text-muted-foreground">The day &amp; month recur annually (e.g. 26 Jan)</p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} aria-label="Repeats every year" />
          </div>

          {/* Scope */}
          <div className="space-y-2">
            <Label className="text-xs">Applies to</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={orgWide ? 'default' : 'outline'} onClick={() => setOrgWide(true)}>All staff</Button>
              <Button type="button" size="sm" variant={!orgWide ? 'default' : 'outline'} onClick={() => setOrgWide(false)}>Specific branches / staff</Button>
            </div>
          </div>

          {!orgWide && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Branches</Label>
                <div className="flex flex-wrap gap-1.5">
                  {outlets.length === 0 && <span className="text-xs text-muted-foreground">No branches</span>}
                  {outlets.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(outletIds, o.id, setOutletIds)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        outletIds.has(o.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
                      )}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Specific staff ({staffIds.size} selected)</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Search staff…" className="h-8 pl-8 text-sm" />
                </div>
                <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                  {filteredStaff.map((s) => {
                    const on = staffIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(staffIds, s.id, setStaffIds)}
                        className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', on ? 'bg-primary/10' : 'hover:bg-muted')}
                      >
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        {s.full_name}
                      </button>
                    );
                  })}
                  {filteredStaff.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No staff match</p>}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add holiday'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Holidays() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const { holidays, loading, error, reload, createHoliday, updateHoliday, deleteHoliday } = useHolidays();

  const [outlets, setOutlets] = useState<Option[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayWithAssignments | null>(null);
  const [calMonth, setCalMonth] = useState<Date>(new Date());

  useEffect(() => {
    (async () => {
      const [o, s] = await Promise.all([
        supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
        supabase.from('staff').select('id, full_name, outlet_id').eq('is_active', true).order('full_name'),
      ]);
      setOutlets((o.data ?? []) as Option[]);
      setStaffList((s.data ?? []) as StaffOption[]);
    })();
  }, []);

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? '—';

  const year = calMonth.getFullYear();
  const occurrences = useMemo(
    () => expandHolidaysInRange(holidays, `${year}-01-01`, `${year}-12-31`),
    [holidays, year],
  );
  const holidayDates = useMemo(() => occurrences.map((o) => parseISO(o.date)), [occurrences]);
  const monthKey = format(calMonth, 'yyyy-MM');
  const monthOccurrences = occurrences.filter((o) => o.date.slice(0, 7) === monthKey);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (h: HolidayWithAssignments) => { setEditing(h); setDialogOpen(true); };
  const handleDelete = async (h: HolidayWithAssignments) => {
    try { await deleteHoliday(h.id); toast.success('Holiday deleted'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  const scopeLabel = (h: HolidayWithAssignments) => {
    if (h.org_wide) return 'All staff';
    const parts: string[] = [];
    if (h.outletIds.length) parts.push(`${h.outletIds.length} branch${h.outletIds.length > 1 ? 'es' : ''}`);
    if (h.staffIds.length) parts.push(`${h.staffIds.length} staff`);
    return parts.join(', ') || '—';
  };

  const columns: DataTableColumn<HolidayWithAssignments>[] = [
    { id: 'name', header: 'Holiday', sortable: true, sortAccessor: (h) => h.name, cell: (h) => <span className="font-medium">{h.name}</span> },
    {
      id: 'date', header: 'Date', sortable: true, sortAccessor: (h) => h.date,
      cell: (h) => (
        <span className="whitespace-nowrap">
          {format(parseISO(h.date), h.recurring_yearly ? 'dd MMM' : 'dd MMM yyyy')}
          {h.recurring_yearly && <span className="ml-1 text-[10px] text-muted-foreground">(yearly)</span>}
        </span>
      ),
    },
    { id: 'type', header: 'Type', cell: (h) => <TypeBadge type={h.type} /> },
    { id: 'paid', header: 'Paid', align: 'center', cell: (h) => (h.is_paid ? 'Yes' : 'No') },
    { id: 'scope', header: 'Applies to', cell: (h) => <span className="text-sm text-muted-foreground">{scopeLabel(h)}</span> },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Holidays" description="Public, optional &amp; restricted holidays and who they apply to">
        {canManage && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Holiday</span>
          </Button>
        )}
      </PageHeader>

      <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'calendar')}>
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5"><List className="h-4 w-4" />List</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="h-4 w-4" />Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {error ? (
            <ErrorState title="Couldn't load holidays" description={error} onRetry={reload} className="py-12" />
          ) : (
            <DataTable
              columns={columns}
              data={holidays}
              rowKey={(h) => h.id}
              isLoading={loading}
              initialSort={{ columnId: 'date', direction: 'asc' }}
              rowActions={canManage ? (h) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => openEdit(h)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{h.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>This removes the holiday and its assignments. Settlements computed afterwards will no longer treat it as a holiday.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(h)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : undefined}
              actionsHeader={canManage ? 'Actions' : undefined}
            />
          )}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <Card>
              <CardContent className="p-3">
                <Calendar
                  mode="single"
                  month={calMonth}
                  onMonthChange={setCalMonth}
                  modifiers={{ holiday: holidayDates }}
                  modifiersClassNames={{ holiday: 'bg-violet-100 text-violet-700 font-semibold dark:bg-violet-500/20 dark:text-violet-300 rounded-md' }}
                  className="p-0"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{format(calMonth, 'MMMM yyyy')}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {monthOccurrences.length === 0 && <p className="text-sm text-muted-foreground">No holidays this month.</p>}
                {monthOccurrences.map((o) => (
                  <div key={`${o.holiday.id}-${o.date}`} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.holiday.name}</p>
                      <p className="text-xs text-muted-foreground">{format(parseISO(o.date), 'EEE, dd MMM')} · {o.holiday.org_wide ? 'All staff' : scopeLabel(o.holiday as HolidayWithAssignments)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!o.holiday.is_paid && <Badge variant="outline" className="text-muted-foreground">Unpaid</Badge>}
                      <TypeBadge type={o.holiday.type as HolidayType} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {canManage && (
        <HolidayDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          outlets={outlets}
          staffList={staffList}
          onSave={(input, targets) => (editing ? updateHoliday(editing.id, input, targets) : createHoliday(input, targets))}
        />
      )}
    </div>
  );
}
