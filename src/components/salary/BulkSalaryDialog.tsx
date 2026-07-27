import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { NotificationEvents } from '@/lib/notifications';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

export interface BulkSalaryStaff {
  id: string;
  full_name: string;
  employee_id?: string | null;
  monthly_salary?: number | null;
  designation?: string | null;
  department?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: BulkSalaryStaff[];
  /** Called after a successful apply so the parent can refetch. */
  onApplied?: () => void;
}

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function BulkSalaryDialog({ open, onOpenChange, staff, onApplied }: Props) {
  const { staffData } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [pct, setPct] = useState('');
  const [saving, setSaving] = useState(false);

  const current = (s: BulkSalaryStaff) => Number(s.monthly_salary ?? 0);
  const newVal = (s: BulkSalaryStaff) => {
    const raw = values[s.id];
    if (raw === undefined || raw.trim() === '') return current(s);
    const n = Number(raw);
    return Number.isFinite(n) ? n : current(s);
  };

  // Changed rows = a valid, non-negative new value different from the current one.
  const changes = useMemo(
    () =>
      staff
        .map((s) => ({ s, from: current(s), to: newVal(s) }))
        .filter((c) => c.to !== c.from && c.to >= 0 && Number.isFinite(c.to)),
    [staff, values],
  );
  const increments = changes.filter((c) => c.to > c.from).length;
  const decrements = changes.filter((c) => c.to < c.from).length;
  const netDelta = changes.reduce((sum, c) => sum + (c.to - c.from), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.employee_id ?? '').toLowerCase().includes(q) ||
        (s.designation ?? '').toLowerCase().includes(q),
    );
  }, [staff, search]);

  const applyPctToShown = () => {
    const p = Number(pct);
    if (!Number.isFinite(p) || p === 0) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const s of filtered) {
        const base = current(s);
        if (base > 0) next[s.id] = String(Math.round(base * (1 + p / 100)));
      }
      return next;
    });
  };

  const reset = () => {
    setValues({});
    setReason('');
    setSearch('');
    setPct('');
  };

  const handleApply = async () => {
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const payload = changes.map((c) => ({
        staff_id: c.s.id,
        monthly_salary: c.to,
        reason: reason.trim() || undefined,
      }));
      const { data, error } = await supabase.rpc('bulk_update_salaries' as never, { _changes: payload } as never);
      if (error) throw error;
      const summary = (data ?? {}) as {
        updated: number; increments: number; decrements: number; net_delta: number;
      };
      // Notify owners of the change (server-recorded in salary_history too).
      await NotificationEvents.salaryBulkUpdated(summary, staffData?.full_name || 'An admin');
      toast({
        title: 'Salaries updated',
        description: `${summary.updated} updated · ${summary.increments} increment(s), ${summary.decrements} reduction(s) · net ${netDelta >= 0 ? '+' : ''}${rupee(summary.net_delta)}/mo.`,
      });
      reset();
      onOpenChange(false);
      onApplied?.();
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Could not update salaries.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk salary update</DialogTitle>
          <DialogDescription>
            Enter each person's new monthly salary. A higher figure is recorded as an increment,
            a lower one as a reduction. Owners are notified and every change is logged.
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, code, designation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Raise shown by %</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 10"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className="w-24"
              />
            </div>
            <Button type="button" variant="secondary" onClick={applyPctToShown}>Apply %</Button>
          </div>
        </div>

        {/* Staff rows */}
        <div className="max-h-[45vh] overflow-y-auto rounded-md border divide-y">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No staff match your search.</p>
          ) : (
            filtered.map((s) => {
              const from = current(s);
              const to = newVal(s);
              const delta = to - from;
              const changed = delta !== 0 && Number.isFinite(to);
              return (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.employee_id}{s.designation ? ` · ${s.designation}` : ''}
                    </p>
                  </div>
                  <div className="w-24 text-right text-sm text-muted-foreground">{rupee(from)}</div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={values[s.id] ?? ''}
                    placeholder={String(from)}
                    onChange={(e) => setValues((p) => ({ ...p, [s.id]: e.target.value }))}
                    className="w-28"
                  />
                  <div className="w-20 text-right">
                    {changed && (
                      <Badge variant={delta > 0 ? 'default' : 'destructive'} className="gap-0.5">
                        {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {delta > 0 ? '+' : ''}{rupee(delta)}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reason + summary */}
        <div className="space-y-2">
          <div>
            <Label htmlFor="bulk-salary-reason" className="text-xs text-muted-foreground">Reason (optional, applies to all)</Label>
            <Input
              id="bulk-salary-reason"
              placeholder="e.g. Annual increment FY26"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {changes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{changes.length}</span> change{changes.length > 1 ? 's' : ''}
              {' · '}<span className="text-emerald-600">{increments} up</span>
              {' · '}<span className="text-destructive">{decrements} down</span>
              {' · '}net <span className="font-medium text-foreground">{netDelta >= 0 ? '+' : ''}{rupee(netDelta)}</span>/mo
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleApply} disabled={saving || changes.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply {changes.length > 0 ? `${changes.length} change${changes.length > 1 ? 's' : ''}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
