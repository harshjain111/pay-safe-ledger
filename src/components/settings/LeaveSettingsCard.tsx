import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/anyClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ErrorState } from '@/components/layout/ErrorState';
import { useSettingsForm } from '@/components/settings/SettingsPanel';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';
import { toAmount } from '@/lib/utils';
import { fetchLeaveTypes, type LeaveAccrualMode, type LeaveTypeRow } from '@/lib/leave';
import { bulkAdjustBalance } from '@/lib/leave-service';

const ACCRUAL_OPTIONS: { value: LeaveAccrualMode; label: string }[] = [
  { value: 'annual', label: 'Annual (granted upfront)' },
  { value: 'monthly', label: 'Monthly (accrues over the year)' },
  { value: 'none', label: 'No auto-allocation' },
];

/**
 * The org's paid-leave entitlement — the single number that says how many paid
 * leave days a year an employee gets.
 *
 * It edits the DEFAULT leave type's `default_quota`, which is what the employee
 * dashboard, the payslip and computeLeaveBalancesForStaff() all read. The
 * legacy `leave_settings` singleton is mirrored on save so the fallback path in
 * fetchLeaveSettings() can never disagree with the type.
 *
 * The per-employee balances in `employee_leave_balance` are a separate, hand-
 * maintainable figure (Leave Balance → Bulk Adjust), so raising the quota does
 * NOT silently rewrite them. The card instead reports how many employees are
 * off the quota and offers one button to bring them onto it, audited.
 */
export function LeaveSettingsCard() {
  const { isOwner, isAdmin, isHR, user } = useAuth();
  const canManage = isOwner || isAdmin || isHR;

  const [type, setType] = useState<LeaveTypeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [quota, setQuota] = useState(0);
  const [accrual, setAccrual] = useState<LeaveAccrualMode>('annual');

  // Employees whose stored balance for this type isn't the quota.
  const [offQuota, setOffQuota] = useState<string[]>([]);
  const [assigned, setAssigned] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const types = await fetchLeaveTypes(true);
      const def = types.find((t) => t.is_default) ?? null;
      setType(def);
      if (!def) { setError(true); return; }
      setQuota(Number(def.default_quota));
      setAccrual(def.accrual);

      const { data, error: balErr } = await supabase
        .from('employee_leave_balance')
        .select('staff_id, balance')
        .eq('leave_type_id', def.id);
      if (balErr) throw balErr;
      const rows = (data ?? []) as { staff_id: string; balance: number }[];
      setAssigned(rows.length);
      setOffQuota(rows.filter((r) => Number(r.balance) !== Number(def.default_quota)).map((r) => r.staff_id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { load(); }, [load]);

  const baseQuota = Number(type?.default_quota ?? 0);
  const baseAccrual: LeaveAccrualMode = type?.accrual ?? 'annual';
  const dirty = !loading && !error && type != null && (quota !== baseQuota || accrual !== baseAccrual);

  // The panel owns the Save button; this card just contributes its fields.
  const persist = useCallback(async () => {
    if (!type) return;
    const nextQuota = accrual === 'none' ? 0 : quota;
    const { error: upErr } = await supabase
      .from('leave_types')
      .update({ default_quota: nextQuota, accrual })
      .eq('id', type.id);
    if (upErr) throw upErr;
    // Mirror into the legacy singleton so the fallback can't drift back.
    await supabase
      .from('leave_settings')
      .update({ annual_quota: nextQuota, accrual: accrual === 'monthly' ? 'monthly' : 'annual', updated_by: user?.id ?? null })
      .eq('singleton', true);
    await load();
  }, [type, quota, accrual, user?.id, load]);
  useSettingsForm('leave-entitlement', dirty, persist);

  const syncBalances = async () => {
    if (!type || offQuota.length === 0) return;
    setSyncing(true);
    try {
      await bulkAdjustBalance({
        staffIds: offQuota,
        leaveTypeId: type.id,
        newBalance: baseQuota,
        comment: `Aligned to the paid-leave entitlement set in Settings (${baseQuota} days/year).`,
        userId: user?.id ?? null,
      });
      toast.success(`${offQuota.length} employee balance(s) set to ${baseQuota}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update balances');
    } finally {
      setSyncing(false);
    }
  };

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Paid Leave Entitlement
          {type && <Badge variant="outline" className="text-[10px]">{type.name} ({type.code})</Badge>}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          How many paid leave days a year an employee gets. Drives the balance on every
          employee's dashboard and the leave lines on their payslip.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error || !type ? (
          <ErrorState
            title="Couldn't load the entitlement"
            description={
              type === null
                ? 'No default leave type is set. Mark one leave type as the default below, then reload.'
                : 'Reload to edit — saving is disabled until the saved values load.'
            }
            onRetry={load}
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Paid leave quota (days / year)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={quota}
                  disabled={accrual === 'none'}
                  onChange={(e) => setQuota(toAmount(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Accrual</Label>
                <Select value={accrual} onValueChange={(v) => setAccrual(v as LeaveAccrualMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {ACCRUAL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stored per-employee balances are maintained separately (Leave
                Balance → Bulk Adjust), so surface any drift rather than
                overwriting someone's deliberate figure on save. */}
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted-foreground sm:max-w-[70%]">
                {offQuota.length === 0
                  ? `All ${assigned} assigned employee${assigned === 1 ? '' : 's'} carry the ${baseQuota}-day balance.`
                  : <>
                      <span className="font-medium text-foreground">{offQuota.length}</span> of {assigned} assigned
                      employees have a stored balance other than {baseQuota}. Setting them to {baseQuota} writes an
                      audit entry for each.
                    </>}
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={syncing || offQuota.length === 0 || dirty}>
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Apply to balances
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Set {offQuota.length} balance(s) to {baseQuota} days?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Overwrites the stored {type.code} balance for every assigned employee not already on {baseQuota},
                      and records a leave-balance adjustment for each. Leave already taken is unaffected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={syncBalances}>Apply to balances</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {dirty && (
              <p className="text-[11px] text-muted-foreground">
                Save the new quota first — then “Apply to balances” can push it to employees.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
