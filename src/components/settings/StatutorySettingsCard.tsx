import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toAmount } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { Loader2, Receipt, Save } from 'lucide-react';

interface StatutoryRow {
  id?: string;
  pf_enabled: boolean;
  pf_default_enroll: boolean;
  pf_employee_rate: number;
  pf_employer_rate: number;
  pf_base_cap: number;
  esi_enabled: boolean;
  esi_employer_rate: number;
  esi_eligibility_ceiling: number;
  pt_enabled: boolean;
  pt_monthly_amount: number;
  pt_min_gross: number;
}

const DEFAULTS: StatutoryRow = {
  pf_enabled: false,
  pf_default_enroll: false,
  pf_employee_rate: 12,
  pf_employer_rate: 12,
  pf_base_cap: 15000,
  esi_enabled: false,
  esi_employer_rate: 3.25,
  esi_eligibility_ceiling: 21000,
  pt_enabled: false,
  pt_monthly_amount: 200,
  pt_min_gross: 15000,
};

export function StatutorySettingsCard() {
  const { isOwner, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<StatutoryRow>(DEFAULTS);

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('payroll_statutory_settings')
        .select('*')
        .maybeSingle();
      if (data) setRow({ ...DEFAULTS, ...(data as Partial<StatutoryRow>) });
      setLoading(false);
    })();
  }, [isOwner]);

  if (!isOwner) return null;

  const set = <K extends keyof StatutoryRow>(k: K, v: StatutoryRow[K]) =>
    setRow((r) => ({ ...r, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...row, singleton: true, updated_by: user?.id ?? null };
      let error;
      if (row.id) {
        ({ error } = await supabase
          .from('payroll_statutory_settings')
          .update(payload)
          .eq('id', row.id));
      } else {
        const ins = await supabase
          .from('payroll_statutory_settings')
          .insert(payload)
          .select('id')
          .single();
        error = ins.error;
        if (ins.data) set('id', ins.data.id);
      }
      if (error) throw error;
      toast.success('Statutory settings saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Statutory Compliance
          <Badge variant="secondary" className="text-[10px] ml-1">Owner</Badge>
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Configure PF, ESI and Professional Tax rates. Per-staff enrollment is set on each staff record.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            {/* PF */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Provident Fund (PF)</Label>
                  <p className="text-xs text-muted-foreground">EPF employee + employer contribution</p>
                </div>
                <Switch checked={row.pf_enabled} onCheckedChange={(v) => set('pf_enabled', v)} />
              </div>
              {row.pf_enabled && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Employee Rate (%)</Label>
                    <Input type="number" step="0.01" value={row.pf_employee_rate}
                      onChange={(e) => set('pf_employee_rate', toAmount(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Employer Rate (%)</Label>
                    <Input type="number" step="0.01" value={row.pf_employer_rate}
                      onChange={(e) => set('pf_employer_rate', toAmount(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Wage Cap (₹)</Label>
                    <Input type="number" value={row.pf_base_cap}
                      onChange={(e) => set('pf_base_cap', toAmount(e.target.value))} />
                    <p className="text-[10px] text-muted-foreground">Statutory ceiling — usually ₹15,000</p>
                  </div>
                  <div className="space-y-1.5 flex flex-col">
                    <Label className="text-xs">Auto-enroll new staff</Label>
                    <div className="flex items-center h-10 gap-2">
                      <Switch checked={row.pf_default_enroll}
                        onCheckedChange={(v) => set('pf_default_enroll', v)} />
                      <span className="text-xs text-muted-foreground">
                        {row.pf_default_enroll ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ESI */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">ESI (Employees' State Insurance)</Label>
                  <p className="text-xs text-muted-foreground">Only for gross ≤ ceiling</p>
                </div>
                <Switch checked={row.esi_enabled} onCheckedChange={(v) => set('esi_enabled', v)} />
              </div>
              {row.esi_enabled && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Employer Rate (%)</Label>
                    <Input type="number" step="0.01" value={row.esi_employer_rate}
                      onChange={(e) => set('esi_employer_rate', toAmount(e.target.value))} />
                    <p className="text-[10px] text-muted-foreground">Default 3.25%</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Eligibility Ceiling (₹)</Label>
                    <Input type="number" value={row.esi_eligibility_ceiling}
                      onChange={(e) => set('esi_eligibility_ceiling', toAmount(e.target.value))} />
                    <p className="text-[10px] text-muted-foreground">Default ₹21,000 gross/month</p>
                  </div>
                </div>
              )}
            </div>

            {/* PT */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Professional Tax (PT)</Label>
                  <p className="text-xs text-muted-foreground">Flat monthly slab</p>
                </div>
                <Switch checked={row.pt_enabled} onCheckedChange={(v) => set('pt_enabled', v)} />
              </div>
              {row.pt_enabled && (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Monthly Amount (₹)</Label>
                    <Input type="number" value={row.pt_monthly_amount}
                      onChange={(e) => set('pt_monthly_amount', toAmount(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Apply When Gross ≥ (₹)</Label>
                    <Input type="number" value={row.pt_min_gross}
                      onChange={(e) => set('pt_min_gross', toAmount(e.target.value))} />
                    <p className="text-[10px] text-muted-foreground">Skip PT for gross below this</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Settings
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
