import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/anyClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';

type Scope = 'department' | 'outlet' | 'role';
interface Ovr { id: string; scope: Scope; department_id: string | null; outlet_id: string | null; role_type: string | null; quota_override: number | null; is_exempt: boolean; carry_forward_override: boolean | null }
interface Named { id: string; name: string }
const ROLES = ['staff', 'accountant', 'admin', 'ca', 'owner'];

/** Advanced per-department / per-outlet / per-role rules for a leave type:
 *  a different quota, a full exemption, and a carry-forward decision. */
export function LeaveTypeOverrides({ leaveTypeId }: { leaveTypeId: string }) {
  const [overrides, setOverrides] = useState<Ovr[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<Ovr | null>(null);
  const [depts, setDepts] = useState<Named[]>([]);
  const [outlets, setOutlets] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [scope, setScope] = useState<Scope>('department');
  const [refId, setRefId] = useState('');       // dept/outlet id, or role string
  const [exempt, setExempt] = useState(false);
  const [quota, setQuota] = useState('');
  const [carry, setCarry] = useState<'inherit' | 'yes' | 'no'>('inherit');

  const load = async () => {
    setLoading(true);
    const [o, d, ou] = await Promise.all([
      supabase.from('leave_type_overrides').select('id, scope, department_id, outlet_id, role_type, quota_override, is_exempt, carry_forward_override').eq('leave_type_id', leaveTypeId).eq('is_active', true),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
      supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
    ]);
    setOverrides((o.data ?? []) as Ovr[]);
    setDepts((d.data ?? []) as Named[]);
    setOutlets((ou.data ?? []) as Named[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leaveTypeId]);

  const targetLabel = (o: Ovr) =>
    o.scope === 'department' ? depts.find((x) => x.id === o.department_id)?.name ?? 'Department'
      : o.scope === 'outlet' ? outlets.find((x) => x.id === o.outlet_id)?.name ?? 'Outlet'
      : (o.role_type ?? 'Role');

  const add = async () => {
    if (!refId) { toast.error(`Select a ${scope}`); return; }
    if (!exempt && quota.trim() === '' && carry === 'inherit') { toast.error('Set a quota, exemption, or carry-forward rule'); return; }
    setAdding(true);
    const { error } = await supabase.from('leave_type_overrides').insert({
      leave_type_id: leaveTypeId,
      scope,
      department_id: scope === 'department' ? refId : null,
      outlet_id: scope === 'outlet' ? refId : null,
      role_type: scope === 'role' ? refId : null,
      quota_override: exempt || quota.trim() === '' ? null : Number(quota),
      is_exempt: exempt,
      carry_forward_override: carry === 'inherit' ? null : carry === 'yes',
      is_active: true,
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setRefId(''); setQuota(''); setExempt(false); setCarry('inherit');
    load();
  };

  // Asked for, not fired on the click. An override sets the quota — or a full
  // exemption — for a whole department, outlet or role, so removing one
  // silently changes what a group of people are entitled to.
  const remove = async (o: Ovr) => {
    const { error } = await supabase.from('leave_type_overrides').delete().eq('id', o.id);
    setConfirmRemove(null);
    if (error) toast.error(error.message); else load();
  };

  const scopeLabel = (o: Ovr) =>
    o.scope === 'role'
      ? o.role_type ?? 'role'
      : (o.scope === 'department' ? depts : outlets)
          .find((n) => n.id === (o.scope === 'department' ? o.department_id : o.outlet_id))?.name
        ?? o.scope;

  const options = scope === 'department' ? depts : scope === 'outlet' ? outlets : ROLES.map((r) => ({ id: r, name: r }));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Advanced — department / outlet / role rules</p>
      <p className="text-[11px] text-muted-foreground">Give specific departments, outlets or roles a different quota, exempt them, or set who carries this leave forward.</p>

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
                    <span className="font-medium capitalize">{targetLabel(o)}</span>
                    {o.is_exempt ? (
                      <Badge variant="outline" className="text-[10px] text-warning">Exempt</Badge>
                    ) : o.quota_override != null ? (
                      <span className="text-muted-foreground">Quota: {o.quota_override}d/yr</span>
                    ) : null}
                    {o.carry_forward_override != null && (
                      <Badge variant="outline" className={o.carry_forward_override ? 'text-[10px] text-success' : 'text-[10px] text-destructive'}>
                        {o.carry_forward_override ? 'Carries forward' : 'No carry forward'}
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive sm:h-7 sm:w-7" onClick={() => setConfirmRemove(o)} aria-label="Remove rule"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Select value={scope} onValueChange={(v) => { setScope(v as Scope); setRefId(''); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="outlet">Outlet</SelectItem>
                <SelectItem value="role">Role</SelectItem>
              </SelectContent>
            </Select>
            <Select value={refId} onValueChange={setRefId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={`Pick ${scope}`} /></SelectTrigger>
              <SelectContent className="bg-popover">
                {options.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">None found</div>
                ) : options.map((x) => <SelectItem key={x.id} value={x.id} className="capitalize">{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
              <Switch checked={exempt} onCheckedChange={setExempt} aria-label="Exempt" />
              <Label className="text-xs">Exempt</Label>
            </div>
            <Input type="number" min="0" step="0.5" placeholder="Quota (days/yr)" value={quota} disabled={exempt} onChange={(e) => setQuota(e.target.value)} className="h-9 w-32" />
            <Select value={carry} onValueChange={(v) => setCarry(v as 'inherit' | 'yes' | 'no')}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="inherit">Carry-fwd: default</SelectItem>
                <SelectItem value="yes">Carry-fwd: yes</SelectItem>
                <SelectItem value="no">Carry-fwd: no</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9 shrink-0 gap-1" onClick={add} disabled={adding}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </>
      )}

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this override?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove && (
                <>
                  {scopeLabel(confirmRemove)} goes back to the leave type&rsquo;s standard
                  entitlement. Anyone currently covered by this rule is affected from the
                  next calculation.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemove && remove(confirmRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
