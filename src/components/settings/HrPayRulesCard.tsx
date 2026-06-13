import { useState, useEffect, useCallback } from 'react';
import { ErrorState } from '@/components/layout/ErrorState';
import { useSingletonSettings } from '@/hooks/useSingletonSettings';
import { useSettingsForm } from '@/components/settings/SettingsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toAmount } from '@/lib/utils';

interface Rules {
  full_day_minutes: number;
  half_day_minutes: number;
  unscheduled_is_off: boolean;
  comp_off_enabled: boolean;
}

const DEFAULTS: Rules = {
  full_day_minutes: 480,
  half_day_minutes: 240,
  unscheduled_is_off: true,
  comp_off_enabled: true,
};

export function HrPayRulesCard() {
  const { isOwner, isAdmin, user } = useAuth();
  const canManage = isOwner || isAdmin;
  const { data, loading, error, reload, save } = useSingletonSettings<Partial<Rules>>(
    'hr_pay_rules',
    '*',
    canManage,
  );
  const [rules, setRules] = useState<Rules>(DEFAULTS);

  useEffect(() => {
    if (data) setRules({ ...DEFAULTS, ...data });
  }, [data]);

  const dirty =
    !loading &&
    !error &&
    data != null &&
    (rules.full_day_minutes !== (data.full_day_minutes ?? DEFAULTS.full_day_minutes) ||
      rules.half_day_minutes !== (data.half_day_minutes ?? DEFAULTS.half_day_minutes) ||
      rules.unscheduled_is_off !== (data.unscheduled_is_off ?? DEFAULTS.unscheduled_is_off) ||
      rules.comp_off_enabled !== (data.comp_off_enabled ?? DEFAULTS.comp_off_enabled));

  // The panel owns the Save button; this card just contributes its fields.
  const persist = useCallback(async () => {
    await save({ ...rules, updated_by: user?.id ?? null });
    await reload();
  }, [save, reload, rules, user?.id]);
  useSettingsForm('attendance-pay-rules', dirty, persist);

  if (!canManage) return null;

  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => ({ ...r, [k]: v }));

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <CalendarClock className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Attendance &amp; Pay Rules
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          How attendance becomes paid days. Changes apply to settlements computed afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <ErrorState
            title="Couldn't load attendance & pay rules"
            description="Reload to edit — saving is disabled until the saved values load."
            onRetry={reload}
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Full day worked (minutes)</Label>
                <Input type="number" value={rules.full_day_minutes} onChange={(e) => set('full_day_minutes', toAmount(e.target.value))} />
                <p className="text-[10px] text-muted-foreground">At least this = full present day (default 480 = 8h)</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Half day worked (minutes)</Label>
                <Input type="number" value={rules.half_day_minutes} onChange={(e) => set('half_day_minutes', toAmount(e.target.value))} />
                <p className="text-[10px] text-muted-foreground">At least this (but below full) = half day (default 240 = 4h)</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-3">
                <Label className="text-sm">Unscheduled day is an off day</Label>
                <p className="text-[10px] text-muted-foreground">A day with no shift allotted in the roster is a paid off day, not an absence</p>
              </div>
              <Switch aria-label="Unscheduled day is an off day" checked={rules.unscheduled_is_off} onCheckedChange={(v) => set('unscheduled_is_off', v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-3">
                <Label className="text-sm">Comp-off for working an off day</Label>
                <p className="text-[10px] text-muted-foreground">Working a rostered off day earns a carried-forward paid leave</p>
              </div>
              <Switch aria-label="Comp-off for working an off day" checked={rules.comp_off_enabled} onCheckedChange={(v) => set('comp_off_enabled', v)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
