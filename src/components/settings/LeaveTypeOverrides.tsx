import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/anyClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';

interface Ovr { id: string; scope: 'department' | 'outlet'; department_id: string | null; outlet_id: string | null; quota_override: number | null; is_exempt: boolean }
interface Named { id: string; name: string }

/** Advanced per-department / per-outlet overrides for a single leave type:
 *  a different quota, or a full exemption. */
export function LeaveTypeOverrides({ leaveTypeId }: { leaveTypeId: string }) {
  const [overrides, setOverrides] = useState<Ovr[]>([]);
  const [depts, setDepts] = useState<Named[]>([]);
  const [outlets, setOutlets] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [scope, setScope] = useState<'department' | 'outlet'>('department');
  const [refId, setRefId] = useState('');
  const [exempt, setExempt] = useState(false);
  const [quota, setQuota] = useState('');

  const load = async () => {
    setLoading(true);
    const [o, d, ou] = await Promise.all([
      supabase.from('leave_type_overrides').select('id, scope, department_id, outlet_id, quota_override, is_exempt').eq('leave_type_id', leaveTypeId).eq('is_active', true),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
      supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
    ]);
    setOverrides((o.data ?? []) as Ovr[]);
    setDepts((d.data ?? []) as Named[]);
    setOutlets((ou.data ?? []) as Named[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leaveTypeId]);

  const nameFor = (o: Ovr) =>
    o.scope === 'department'
      ? depts.find((x) => x.id === o.department_id)?.name ?? 'Department'
      : outlets.find((x) => x.id === o.outlet_id)?.name ?? 'Outlet';

  const add = async () => {
    if (!refId) { toast.error(`Select a ${scope}`); return; }
    if (!exempt && quota.trim() === '') { toast.error('Set a quota override or mark exempt'); return; }
    setAdding(true);
    const { error } = await supabase.from('leave_type_overrides').insert({
      leave_type_id: leaveTypeId,
      scope,
      department_id: scope === 'department' ? refId : null,
      outlet_id: scope === 'outlet' ? refId : null,
      quota_override: exempt || quota.trim() === '' ? null : Number(quota),
      is_exempt: exempt,
      is_active: true,
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setRefId(''); setQuota(''); setExempt(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('leave_type_overrides').delete().eq('id', id);
    if (error) toast.error(error.message); else load();
  };

  const options = scope === 'department' ? depts : outlets;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Advanced — department / outlet rules</p>
      <p className="text-[11px] text-muted-foreground">Give specific departments or outlets a different quota, or exempt them from this leave type entirely.</p>

      {loading ? (
        <div className="py-3 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {overrides.length > 0 && (
            <div className="space-y-1.5">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="outline" className="text-[10px] capitalize">{o.scope}</Badge>
                    <span className="font-medium">{nameFor(o)}</span>
                    {o.is_exempt ? (
                      <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400">Exempt</Badge>
                    ) : (
                      <span className="text-muted-foreground">Quota: {o.quota_override}d/yr</span>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(o.id)} aria-label="Remove override"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Select value={scope} onValueChange={(v) => { setScope(v as 'department' | 'outlet'); setRefId(''); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="outlet">Outlet</SelectItem>
              </SelectContent>
            </Select>
            <Select value={refId} onValueChange={setRefId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={`Pick ${scope}`} /></SelectTrigger>
              <SelectContent className="bg-popover">
                {options.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">None found</div>
                ) : options.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
              <Switch checked={exempt} onCheckedChange={setExempt} aria-label="Exempt" />
              <Label className="text-xs">Exempt</Label>
            </div>
            <Input type="number" min="0" step="0.5" placeholder="Quota override (days/yr)" value={quota} disabled={exempt} onChange={(e) => setQuota(e.target.value)} className="h-9" />
            <Button size="sm" className="h-9 shrink-0 gap-1" onClick={add} disabled={adding}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </>
      )}
    </div>
  );
}
