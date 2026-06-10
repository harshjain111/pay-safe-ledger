import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/toast';
import { CalendarClock, Loader2, Save } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<Rules>(DEFAULTS);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase.from('hr_pay_rules' as never).select('*').maybeSingle();
      if (error) toast.error('Could not load attendance & pay rules — please reload before saving.');
      else if (data) setRules({ ...DEFAULTS, ...(data as Partial<Rules>) });
      setLoading(false);
    })();
  }, [canManage]);

  if (!canManage) return null;

  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => ({ ...r, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('hr_pay_rules' as never)
        .update({ ...rules, updated_by: user?.id ?? null } as never)
        .eq('singleton', true);
      if (error) throw error;
      toast.success('Attendance & pay rules saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

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
              <Switch checked={rules.unscheduled_is_off} onCheckedChange={(v) => set('unscheduled_is_off', v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-3">
                <Label className="text-sm">Comp-off for working an off day</Label>
                <p className="text-[10px] text-muted-foreground">Working a rostered off day earns a carried-forward paid leave</p>
              </div>
              <Switch checked={rules.comp_off_enabled} onCheckedChange={(v) => set('comp_off_enabled', v)} />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
