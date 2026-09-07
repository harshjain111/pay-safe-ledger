import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/anyClient';
import { BranchGeofenceDialog } from './BranchGeofenceDialog';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusTabs } from '@/components/ui/status-tabs';
import { Paginator, EmptyState } from '@/components/patterns';
import { usePagination } from '@/hooks/usePagination';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import {
  Store, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, MapPin, CalendarClock, Search,
} from 'lucide-react';

import { fetchMaster, type MasterRow, type MasterTable } from '@/lib/masters-cache';

// ---------------------------------------------------------------------------
// Outlets, Departments and Designations.
//
// These were three columns side by side. The lists are nothing like the same
// length — 8 outlets, 3 departments, 58 designations — so scrolling to reach
// the designations left two dead columns and one ragged strip running down the
// right of the screen.
//
// One list at a time now, full width, chosen by a tab. Each carries its own
// search and pager, so a list is the same height whether it holds three rows
// or three hundred. The choice lives in the URL (?list=designations), so a
// refresh or a shared link lands where you were.
// ---------------------------------------------------------------------------

interface ListDef {
  value: MasterTable;
  label: string;
  singular: string;
  placeholder: string;
}

const LISTS: ListDef[] = [
  { value: 'outlets', label: 'Outlets', singular: 'Outlet', placeholder: 'New outlet name' },
  { value: 'departments', label: 'Departments', singular: 'Department', placeholder: 'New department name' },
  { value: 'designations', label: 'Designations', singular: 'Designation', placeholder: 'New designation name' },
];

function MasterList({
  table,
  singular,
  label,
  placeholder,
  rowExtra,
  onCount,
}: {
  table: MasterTable;
  singular: string;
  label: string;
  placeholder: string;
  rowExtra?: (row: MasterRow) => ReactNode;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: 'toggle' | 'delete' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MasterRow | null>(null);

  // Force-refetch through the shared masters cache: this runs after every add /
  // toggle / delete here, so the cache the rest of the app reads is refreshed
  // from the same round trip instead of serving a stale list.
  const fetchRows = useCallback(async () => {
    try {
      const next = await fetchMaster(table, true);
      setRows(next);
      onCount?.(next.length);
    } catch {
      /* leave the last-known list on screen */
    }
    setIsLoading(false);
  }, [table, onCount]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const pager = usePagination(filtered, 20);

  const addRow = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsAdding(true);
    const { error } = await supabase.from(table).insert({ name: trimmed });
    if (error) {
      toast.error(error.message.includes('unique')
        ? singular + ' already exists'
        : 'Failed to add ' + singular.toLowerCase());
    } else {
      toast.success(singular + ' added');
      setNewName('');
      // Otherwise the row you just added is filtered out of the list you are
      // looking at, and it reads as though the add failed.
      setSearch('');
      fetchRows();
    }
    setIsAdding(false);
  };

  const toggleActive = async (row: MasterRow) => {
    try {
      setBusy({ id: row.id, action: 'toggle' });
      const { error } = await supabase.from(table).update({ is_active: !row.is_active }).eq('id', row.id);
      if (error) toast.error('Failed to update');
      else await fetchRows();
    } finally {
      setBusy(null);
    }
  };

  const deleteRow = async (row: MasterRow) => {
    try {
      setBusy({ id: row.id, action: 'delete' });
      const { error } = await supabase.from(table).delete().eq('id', row.id);
      if (error) toast.error('Cannot delete: ' + singular.toLowerCase() + ' may be assigned to staff');
      else {
        toast.success(singular + ' deleted');
        await fetchRows();
      }
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={placeholder}
            aria-label={'New ' + singular.toLowerCase() + ' name'}
            className="h-11 min-w-0 text-sm sm:h-10"
            onKeyDown={(e) => e.key === 'Enter' && addRow()}
          />
          <Button
            onClick={addRow}
            disabled={isAdding || !newName.trim()}
            className="h-11 shrink-0 gap-1.5 sm:h-10"
          >
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
        <div className="relative sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={'Search ' + label.toLowerCase()}
            aria-label={'Search ' + label.toLowerCase()}
            className="h-11 pl-9 text-sm sm:h-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title={search ? 'Nothing matches that search' : 'No ' + label.toLowerCase() + ' yet'}
          instruction={search
            ? 'Clear the search box to see the whole list.'
            : 'Add the first one above — it becomes selectable when enrolling staff.'}
        />
      ) : (
        <>
          <div className="divide-y rounded-xl border bg-card">
            {pager.pageRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{row.name}</span>
                  {!row.is_active && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">Disabled</Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {rowExtra?.(row)}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 sm:h-8 sm:w-8"
                    onClick={() => toggleActive(row)}
                    disabled={busy?.id === row.id}
                    title={row.is_active ? 'Disable' : 'Enable'}
                    aria-label={(row.is_active ? 'Disable ' : 'Enable ') + row.name}
                  >
                    {busy?.id === row.id && busy.action === 'toggle' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : row.is_active ? (
                      <ToggleRight className="h-4 w-4 text-primary" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-destructive hover:text-destructive sm:h-8 sm:w-8"
                    onClick={() => setConfirmDelete(row)}
                    disabled={busy?.id === row.id}
                    aria-label={'Delete ' + row.name}
                  >
                    {busy?.id === row.id && busy.action === 'delete' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {filtered.length > pager.pageSize && (
            <Paginator {...pager} noun={label} className="rounded-xl border bg-card" />
          )}
        </>
      )}

      {/* Deleting went straight through on a single click. These lists are
          referenced by every staff record, so it asks first. */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops being offered when enrolling staff. Anyone already assigned to it
              keeps it, and the delete is refused if it is still in use — disable it
              instead to retire it without touching history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteRow(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OutletGeofenceAction({ outletId, outletName }: { outletId: string; outletName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 sm:h-8 sm:w-8"
        title="Geofence"
        aria-label={'Geofence for ' + outletName}
        onClick={() => setOpen(true)}
      >
        <MapPin className="h-4 w-4 text-muted-foreground" />
      </Button>
      <BranchGeofenceDialog open={open} onOpenChange={setOpen} outletId={outletId} outletName={outletName} />
    </>
  );
}

// Whether a designation banks its unused weekly offs.
//
// The weekly off is a monthly quota and normally lapses at month end. Valets
// work through the month and take the days together, so theirs has to survive
// — no cap, no expiry. Kept on the designation rather than hardcoded to the
// name, so any designation can be given it without a migration.
//
// The value is passed in rather than fetched here: this used to run its own
// query per row, so opening the designations list fired 58 of them.
function CarryForwardToggle({
  designationId, name, on, onChanged,
}: {
  designationId: string;
  name: string;
  on: boolean;
  onChanged: (id: string, next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    const next = !on;
    const { error } = await supabase
      .from('designations')
      .update({ weekly_off_carry_forward: next })
      .eq('id', designationId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChanged(designationId, next);
    toast.success(next
      ? name + ': unused weekly offs now carry forward'
      : name + ': unused weekly offs now lapse at month end');
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-11 gap-1.5 px-2 text-xs sm:h-8"
      disabled={busy}
      onClick={toggle}
      title={on
        ? 'Unused weekly offs roll into the next month. Click to make them lapse.'
        : 'Unused weekly offs lapse at month end. Click to carry them forward.'}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
      <span className={on ? 'text-primary' : 'text-muted-foreground'}>
        {on ? 'Offs carry forward' : 'Offs lapse'}
      </span>
    </Button>
  );
}

export function ManageOutletsDepartmentsCard() {
  const { isOwner, isAdmin, isAccountant, isHR } = useAuth();
  const canManage = isOwner || isAdmin || isAccountant || isHR;

  const [params, setParams] = useSearchParams();
  const active = LISTS.find((l) => l.value === params.get('list'))?.value ?? 'outlets';
  const [counts, setCounts] = useState<Partial<Record<MasterTable, number>>>({});

  // One query for every designation's carry-forward flag, rather than one per
  // row from inside the toggle.
  const [carry, setCarry] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('designations').select('id, weekly_off_carry_forward');
      if (cancelled || !data) return;
      const map: Record<string, boolean> = {};
      for (const d of data as { id: string; weekly_off_carry_forward: boolean | null }[]) {
        map[d.id] = !!d.weekly_off_carry_forward;
      }
      setCarry(map);
    })();
    return () => { cancelled = true; };
  }, [canManage]);

  const setCount = useCallback((table: MasterTable, n: number) => {
    setCounts((prev) => (prev[table] === n ? prev : { ...prev, [table]: n }));
  }, []);
  const onOutlets = useCallback((n: number) => setCount('outlets', n), [setCount]);
  const onDepartments = useCallback((n: number) => setCount('departments', n), [setCount]);
  const onDesignations = useCallback((n: number) => setCount('designations', n), [setCount]);

  if (!canManage) return null;

  const current = LISTS.find((l) => l.value === active) ?? LISTS[0];
  const onCount = active === 'outlets' ? onOutlets
    : active === 'departments' ? onDepartments
      : onDesignations;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Store className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
          Outlets, Departments &amp; Designations
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Master lists used when enrolling staff — pick a list to manage it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        <StatusTabs
          value={active}
          onValueChange={(v) => setParams((p) => { p.set('list', v); return p; }, { replace: true })}
          tabs={LISTS.map((l) => ({ value: l.value, label: l.label, count: counts[l.value] }))}
        />

        {/* Keyed on the table so switching lists resets search and paging
            rather than carrying page 3 of the designations into a 3-row list. */}
        <MasterList
          key={active}
          table={active}
          singular={current.singular}
          label={current.label}
          placeholder={current.placeholder}
          onCount={onCount}
          rowExtra={
            active === 'outlets'
              ? (row) => <OutletGeofenceAction outletId={row.id} outletName={row.name} />
              : active === 'designations'
                ? (row) => (
                  <CarryForwardToggle
                    designationId={row.id}
                    name={row.name}
                    on={!!carry[row.id]}
                    onChanged={(id, next) => setCarry((p) => ({ ...p, [id]: next }))}
                  />
                )
                : undefined
          }
        />
      </CardContent>
    </Card>
  );
}
