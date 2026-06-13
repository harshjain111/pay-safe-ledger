import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/layout/ErrorState';
import { useSingletonSettings } from '@/hooks/useSingletonSettings';
import { useSettingsForm } from '@/components/settings/SettingsPanel';
import { CalendarDays, Loader2 } from 'lucide-react';
import { toAmount } from '@/lib/utils';
import type { LeaveAccrual } from '@/lib/leave';

export function LeaveSettingsCard() {
  const { isOwner, isAdmin, user } = useAuth();
  const canManage = isOwner || isAdmin;

  const { data, loading, error, reload, save } = useSingletonSettings<{
    annual_quota?: number;
    accrual?: string;
  }>('leave_settings', 'annual_quota, accrual', canManage);

  const [quota, setQuota] = useState(12);
  const [accrual, setAccrual] = useState<LeaveAccrual>('annual');

  useEffect(() => {
    if (data) {
      setQuota(Number(data.annual_quota ?? 12));
      setAccrual(data.accrual === 'monthly' ? 'monthly' : 'annual');
    }
  }, [data]);

  const baseQuota = Number(data?.annual_quota ?? 12);
  const baseAccrual: LeaveAccrual = data?.accrual === 'monthly' ? 'monthly' : 'annual';
  const dirty = !loading && !error && data != null && (quota !== baseQuota || accrual !== baseAccrual);

  // The panel owns the Save button; this card just contributes its fields.
  const persist = useCallback(async () => {
    await save({ annual_quota: quota, accrual, updated_by: user?.id ?? null });
    await reload();
  }, [save, reload, quota, accrual, user?.id]);
  useSettingsForm('leave-entitlement', dirty, persist);

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Leave Entitlement
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Paid-leave quota used for pending-leave balances
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <ErrorState
            title="Couldn't load leave settings"
            description="Reload to edit — saving is disabled until the saved values load."
            onRetry={reload}
            className="py-8"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Paid leave quota (days / year)</Label>
              <Input type="number" value={quota} onChange={(e) => setQuota(toAmount(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Accrual</Label>
              <Select value={accrual} onValueChange={(v) => setAccrual(v as LeaveAccrual)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="annual">Annual (granted upfront)</SelectItem>
                  <SelectItem value="monthly">Monthly (accrues over the year)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
