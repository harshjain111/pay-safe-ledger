import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { TrendingUp, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toAmount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer } from '@/components/patterns';
import { toast } from '@/lib/toast';

interface HistoryRow {
  id: string;
  monthly_salary: number;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
  changed_by: string | null;
}

/**
 * PHASE 7 — the employee record's Salary section: that person's
 * salary_history intervals plus a "Revise Salary" drawer that (like the
 * Salary Increments screen) writes ONLY through the bulk_update_salaries RPC.
 * Gated on salaries.view.
 */
export function SalaryHistoryCard({ staffId, staffName, currentSalary }: { staffId: string; staffName: string; currentSalary: number }) {
  const { can, isOwner } = useAuth();
  const canView = isOwner || can('salaries.view');
  const canRevise = isOwner || can('salaries.edit');

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [reviseOpen, setReviseOpen] = useState(false);
  const [newSalary, setNewSalary] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('salary_history' as never)
      .select('id, monthly_salary, effective_from, effective_to, change_reason, changed_by')
      .eq('staff_id', staffId)
      .order('effective_from', { ascending: false });
    const list = ((data ?? []) as unknown as HistoryRow[]);
    setRows(list);
    const ids = [...new Set(list.map((r) => r.changed_by).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: st } = await supabase.from('staff').select('user_id, full_name').in('user_id', ids);
      setNames(new Map(((st ?? []) as { user_id: string | null; full_name: string }[]).filter((s) => s.user_id).map((s) => [s.user_id as string, s.full_name])));
    }
  }, [staffId]);

  useEffect(() => { if (canView) reload(); }, [canView, reload]);

  if (!canView) return null;

  const doRevise = async () => {
    const value = toAmount(newSalary);
    if (!value || value <= 0) { toast.error('Enter the new monthly salary'); return; }
    if (!reason.trim()) { toast.error('A reason is mandatory'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('bulk_update_salaries' as never, {
        _changes: [{ staff_id: staffId, monthly_salary: value, reason: `${reason.trim()} (effective ${effectiveFrom})` }],
      } as never);
      if (error) throw error;
      toast.success(`Salary revised for ${staffName}.`);
      setReviseOpen(false);
      setNewSalary(''); setReason('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revise the salary');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Salary
          </CardTitle>
          <CardDescription>Revision history — written only by the bulk_update_salaries RPC.</CardDescription>
        </div>
        {canRevise && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setReviseOpen(true); setNewSalary(''); setReason(''); }}>
            <Pencil className="h-3.5 w-3.5" /> Revise Salary
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No revision history — current salary ₹{toAmount(currentSalary).toLocaleString('en-IN')} has applied since joining.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
              <thead>
                <tr className="border-b bg-secondary/40 text-left text-xs text-muted-foreground">
                  <th className="px-2.5 py-1.5 font-medium">Effective From</th>
                  <th className="px-2.5 py-1.5 font-medium">Effective To</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Monthly Salary</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Change</th>
                  <th className="px-2.5 py-1.5 font-medium">Reason</th>
                  <th className="px-2.5 py-1.5 font-medium">Changed By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => {
                  const prev = rows[i + 1];
                  const change = prev ? toAmount(r.monthly_salary) - toAmount(prev.monthly_salary) : null;
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-2.5 py-1.5">{format(parseISO(r.effective_from), 'dd MMM yyyy')}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5">{r.effective_to ? format(parseISO(r.effective_to), 'dd MMM yyyy') : <span className="text-success">Current</span>}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-medium">{toAmount(r.monthly_salary).toLocaleString('en-IN')}</td>
                      <td className={`whitespace-nowrap px-2.5 py-1.5 text-right ${change == null ? '' : change >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toLocaleString('en-IN')}`}
                      </td>
                      <td className="max-w-[16rem] truncate px-2.5 py-1.5" title={r.change_reason ?? ''}>{r.change_reason ?? '—'}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5">{r.changed_by ? (names.get(r.changed_by) ?? 'User') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Drawer
        open={reviseOpen}
        onOpenChange={setReviseOpen}
        title={`Revise Salary — ${staffName}`}
        size="md"
        footer={<Button className="w-full" onClick={doRevise} disabled={busy}>{busy ? 'Revising…' : 'Revise Salary'}</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            Current salary: <span className="font-semibold">₹{toAmount(currentSalary).toLocaleString('en-IN')}</span>
          </div>
          <div className="space-y-1.5">
            <Label>New Monthly Salary (₹) *</Label>
            <Input type="number" min="0" value={newSalary} onChange={(e) => setNewSalary(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective From *</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            <p className="text-xs text-muted-foreground">Recorded effective today by the RPC; the chosen date is kept in the reason.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (mandatory) *</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      </Drawer>
    </Card>
  );
}
