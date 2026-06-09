import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { CalendarDays, Loader2, Save } from 'lucide-react';
import { toAmount } from '@/lib/utils';
import type { LeaveAccrual } from '@/lib/leave';

export function LeaveSettingsCard() {
  const { isOwner, isAdmin, user } = useAuth();
  const canManage = isOwner || isAdmin;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quota, setQuota] = useState(12);
  const [accrual, setAccrual] = useState<LeaveAccrual>('annual');

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('leave_settings' as never)
        .select('annual_quota, accrual')
        .maybeSingle();
      if (data) {
        const d = data as { annual_quota?: number; accrual?: string };
        setQuota(Number(d.annual_quota ?? 12));
        setAccrual(d.accrual === 'monthly' ? 'monthly' : 'annual');
      }
      setLoading(false);
    })();
  }, [canManage]);

  if (!canManage) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('leave_settings' as never)
        .update({ annual_quota: quota, accrual, updated_by: user?.id ?? null } as never)
        .eq('singleton', true);
      if (error) throw error;
      toast.success('Leave settings saved');
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
        ) : (
          <div className="space-y-4">
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
