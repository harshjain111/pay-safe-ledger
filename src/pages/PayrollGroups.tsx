import { useEffect, useMemo, useState } from 'react';
import { format, subMonths } from 'date-fns';
import { Users2, Plus, Pencil, Trash2, Loader2, Check, Search, ShieldAlert, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import type { Staff } from '@/types/database';
import { gatherSettlementInputs, computeSettlement, persistGroupSettlement, isMonthSettled, type StatutorySettings } from '@/lib/settlement-engine';

interface PayrollGroup {
  id: string;
  name: string;
  pay_cycle: string;
  pf_default: boolean;
  esi_default: boolean;
  pt_default: boolean;
  rounding: 'none' | 'nearest' | 'up' | 'down';
  payment_mode_default: string;
  is_default: boolean;
}
interface StaffLite { id: string; full_name: string; employee_id: string; outlet_id: string | null; department_id: string | null; payroll_group_id: string | null }

const CYCLES = [{ v: 'monthly', l: 'Monthly' }, { v: 'weekly', l: 'Weekly' }, { v: 'biweekly', l: 'Bi-weekly' }];
const ROUNDINGS = [{ v: 'none', l: 'No rounding' }, { v: 'nearest', l: 'Nearest rupee' }, { v: 'up', l: 'Round up' }, { v: 'down', l: 'Round down' }];
const MODES = [{ v: 'bank_transfer', l: 'Bank transfer' }, { v: 'cash', l: 'Cash' }, { v: 'upi', l: 'UPI' }, { v: 'cheque', l: 'Cheque' }];

// ---- group create/edit dialog ----------------------------------------------
function GroupDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: PayrollGroup | null; onSaved: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const [pf, setPf] = useState(true);
  const [esi, setEsi] = useState(true);
  const [pt, setPt] = useState(true);
  const [rounding, setRounding] = useState('none');
  const [mode, setMode] = useState('bank_transfer');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? ''); setCycle(editing?.pay_cycle ?? 'monthly');
    setPf(editing?.pf_default ?? true); setEsi(editing?.esi_default ?? true); setPt(editing?.pt_default ?? true);
    setRounding(editing?.rounding ?? 'none'); setMode(editing?.payment_mode_default ?? 'bank_transfer');
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), pay_cycle: cycle, pf_default: pf, esi_default: esi, pt_default: pt, rounding, payment_mode_default: mode };
      if (editing) {
        const { error } = await supabase.from('payroll_groups').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payroll_groups').insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
      toast.success(editing ? 'Group updated' : 'Group created');
      onSaved(); onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      toast.error(/duplicate|unique/i.test(msg) ? 'A group with that name exists' : msg);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Payroll Group' : 'New Payroll Group'}</DialogTitle>
          <DialogDescription>Policy applied to members when running a batch settlement.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen Staff" disabled={editing?.is_default} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Pay cycle</Label>
              <Select value={cycle} onValueChange={setCycle}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="bg-popover">{CYCLES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Rounding</Label>
              <Select value={rounding} onValueChange={setRounding}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="bg-popover">{ROUNDINGS.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Default payment mode</Label>
            <Select value={mode} onValueChange={setMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="bg-popover">{MODES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Statutory defaults (applied to members on assignment)</p>
            <div className="flex items-center justify-between"><Label className="text-sm">Provident Fund (PF)</Label><Switch checked={pf} onCheckedChange={setPf} aria-label="PF default" /></div>
            <div className="flex items-center justify-between"><Label className="text-sm">ESI</Label><Switch checked={esi} onCheckedChange={setEsi} aria-label="ESI default" /></div>
            <div className="flex items-center justify-between"><Label className="text-sm">Professional Tax (PT)</Label><Switch checked={pt} onCheckedChange={setPt} aria-label="PT default" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PayrollGroups() {
  const { user, staffData, can } = useAuth();
  const canManage = can('settings.payroll.edit');
  const canSettle = can('settlements.run');

  const [groups, setGroups] = useState<PayrollGroup[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<PayrollGroup | null>(null);

  // assign
  const [assignSearch, setAssignSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetGroup, setTargetGroup] = useState('');
  const [applyStatutory, setApplyStatutory] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // batch settle
  const [runGroup, setRunGroup] = useState('');
  const [runMonth, setRunMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ done: number; failed: { name: string; error: string }[] } | null>(null);

  const reloadGroups = async () => {
    const { data } = await supabase.from('payroll_groups').select('id, name, pay_cycle, pf_default, esi_default, pt_default, rounding, payment_mode_default, is_default').order('is_default', { ascending: false }).order('name');
    setGroups((data ?? []) as PayrollGroup[]);
  };
  const reloadStaff = async () => {
    const { data } = await supabase.from('staff').select('id, full_name, employee_id, outlet_id, department_id, payroll_group_id').eq('is_active', true).order('full_name');
    setStaff((data ?? []) as StaffLite[]);
  };

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    (async () => { setLoading(true); await Promise.all([reloadGroups(), reloadStaff()]); setLoading(false); })();
  }, [canManage]);

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? (groups.find((g) => g.is_default)?.name ?? 'Default');
  const memberCount = (gid: string) => staff.filter((s) => s.payroll_group_id === gid || (groups.find((g) => g.id === gid)?.is_default && !s.payroll_group_id)).length;

  const filteredStaff = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, assignSearch]);

  const doAssign = async () => {
    if (selected.size === 0 || !targetGroup) { toast.error('Pick staff and a target group'); return; }
    const grp = groups.find((g) => g.id === targetGroup);
    setAssigning(true);
    try {
      const patch: Record<string, unknown> = { payroll_group_id: targetGroup };
      if (applyStatutory && grp) { patch.pf_enrolled = grp.pf_default; patch.esi_enrolled = grp.esi_default; }
      const { error } = await supabase.from('staff').update(patch).in('id', [...selected]);
      if (error) throw error;
      toast.success(`Assigned ${selected.size} staff to ${grp?.name}`);
      setSelected(new Set());
      reloadStaff();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign');
    } finally { setAssigning(false); }
  };

  const deleteGroup = async (g: PayrollGroup) => {
    const { error } = await supabase.from('payroll_groups').delete().eq('id', g.id);
    if (error) { toast.error('Could not delete (staff may be assigned)'); return; }
    toast.success('Group deleted'); reloadGroups(); reloadStaff();
  };

  // members of the selected run group (incl. default-group fallback)
  const runMembers = useMemo(() => {
    if (!runGroup) return [];
    const grp = groups.find((g) => g.id === runGroup);
    return staff.filter((s) => s.payroll_group_id === runGroup || (grp?.is_default && !s.payroll_group_id));
  }, [runGroup, staff, groups]);

  const checkSettled = async () => {
    if (runMembers.length === 0) return;
    setChecking(true); setRunResult(null);
    const { data } = await supabase.from('salary_settlements').select('staff_id').eq('settlement_month', runMonth).in('staff_id', runMembers.map((m) => m.id));
    setSettledIds(new Set((data ?? []).map((r) => r.staff_id)));
    setChecking(false);
  };
  useEffect(() => { if (runGroup) checkSettled(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [runGroup, runMonth, staff]);

  const unsettled = runMembers.filter((m) => !settledIds.has(m.id));

  const runBatch = async () => {
    if (!user?.id || unsettled.length === 0) return;
    const grp = groups.find((g) => g.id === runGroup);
    const approverName = getUserDisplayName(user, staffData);
    setRunning(true);
    const failed: { name: string; error: string }[] = [];
    let done = 0;
    try {
      for (const m of unsettled) {
        try {
          if (await isMonthSettled(m.id, runMonth)) continue; // guard against double-settle
          const { data: full } = await supabase.from('staff').select('*').eq('id', m.id).single();
          const staffRow = full as unknown as Staff;
          const inputs = await gatherSettlementInputs(staffRow, runMonth);
          const calc = computeSettlement(inputs, { rounding: grp?.rounding });
          await persistGroupSettlement(calc, { staff: staffRow, month: runMonth, userId: user.id, approverName });
          done += 1;
        } catch (e) {
          failed.push({ name: m.full_name, error: e instanceof Error ? e.message : 'failed' });
        }
      }
      setRunResult({ done, failed });
      toast[failed.length ? 'error' : 'success'](`Settled ${done} of ${unsettled.length}${failed.length ? ` · ${failed.length} failed` : ''}`);
      checkSettled();
    } finally { setRunning(false); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="You need the “Edit payroll & statutory settings” permission." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Payroll Groups" description="Group staff under a shared policy and settle a whole group for a month." />

      <Tabs defaultValue="groups">
        <TabsList>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="assign">Assign</TabsTrigger>
          <TabsTrigger value="batch" className="gap-1.5"><Play className="h-4 w-4" />Batch Settle</TabsTrigger>
        </TabsList>

        {/* Groups */}
        <TabsContent value="groups" className="mt-4 space-y-3">
          <div className="flex justify-end"><Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setDialog(true); }}><Plus className="h-4 w-4" />New group</Button></div>
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((g) => (
                <Card key={g.id}><CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5"><span className="font-medium">{g.name}</span>{g.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}</div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground capitalize">{g.pay_cycle} · {ROUNDINGS.find((r) => r.v === g.rounding)?.l} · {memberCount(g.id)} staff</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {g.pf_default && <Badge variant="outline" className="text-[10px]">PF</Badge>}
                        {g.esi_default && <Badge variant="outline" className="text-[10px]">ESI</Badge>}
                        {g.pt_default && <Badge variant="outline" className="text-[10px]">PT</Badge>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => { setEditing(g); setDialog(true); }}><Pencil className="h-4 w-4" /></Button>
                      {!g.is_default && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete “{g.name}”?</AlertDialogTitle><AlertDialogDescription>Members fall back to the default group.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteGroup(g)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Assign */}
        <TabsContent value="assign" className="mt-4">
          <Card><CardContent className="space-y-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1"><Label className="text-xs">Assign to group</Label>
                <Select value={targetGroup} onValueChange={setTargetGroup}><SelectTrigger className="w-[12rem]"><SelectValue placeholder="Select group" /></SelectTrigger><SelectContent className="bg-popover">{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={applyStatutory} onCheckedChange={setApplyStatutory} aria-label="Apply statutory defaults" /> Apply the group’s PF/ESI defaults to these staff</label>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Staff ({selected.size} selected)</Label>
              <div className="flex gap-2 text-[11px]"><button type="button" className="text-primary hover:underline" onClick={() => setSelected(new Set(filteredStaff.map((s) => s.id)))}>All</button><button type="button" className="text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>None</button></div>
            </div>
            <div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} placeholder="Search staff…" className="h-8 pl-8 text-sm" /></div>
            <div className="grid max-h-60 grid-cols-1 gap-0.5 overflow-y-auto rounded-lg border p-1 sm:grid-cols-2">
              {filteredStaff.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => { const n = new Set(selected); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setSelected(n); }} className={cn('flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', on ? 'bg-primary/10' : 'hover:bg-muted')}>
                    <span className="flex items-center gap-2 min-w-0"><span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span><span className="truncate">{s.full_name}</span></span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{groupName(s.payroll_group_id)}</span>
                  </button>
                );
              })}
            </div>
            <Button onClick={doAssign} disabled={assigning || selected.size === 0 || !targetGroup} className="gap-1.5">{assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}Assign {selected.size || ''}</Button>
          </CardContent></Card>
        </TabsContent>

        {/* Batch settle */}
        <TabsContent value="batch" className="mt-4">
          {!canSettle ? (
            <EmptyState icon={ShieldAlert} title="Settlement permission required" description="You need the “Run salary settlements” permission to settle a group." />
          ) : (
            <Card><CardContent className="space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1"><Label className="text-xs">Group</Label>
                  <Select value={runGroup} onValueChange={setRunGroup}><SelectTrigger className="w-[12rem]"><SelectValue placeholder="Select group" /></SelectTrigger><SelectContent className="bg-popover">{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Month</Label>
                  <Select value={runMonth} onValueChange={setRunMonth}><SelectTrigger className="w-[10rem]"><SelectValue /></SelectTrigger><SelectContent className="bg-popover">{Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM')).map((m) => <SelectItem key={m} value={m}>{format(new Date(m + '-01'), 'MMMM yyyy')}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>

              {runGroup && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {checking ? 'Checking…' : <>{runMembers.length} member{runMembers.length === 1 ? '' : 's'} · <span className="font-semibold text-foreground">{unsettled.length}</span> not yet settled · {settledIds.size} already settled</>}
                  </p>
                  <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-1">
                    {runMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
                        <span>{m.full_name}</span>
                        {settledIds.has(m.id) ? <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400">Settled</Badge> : <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">Pending</Badge>}
                      </div>
                    ))}
                    {runMembers.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No members in this group.</p>}
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={running || unsettled.length === 0} className="gap-1.5">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Settle {unsettled.length} member{unsettled.length === 1 ? '' : 's'}</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Settle {unsettled.length} salaries for {format(new Date(runMonth + '-01'), 'MMMM yyyy')}?</AlertDialogTitle>
                        <AlertDialogDescription>This computes each member's settlement (group rounding applied), posts the accrual journal, and queues a payout request in Payouts for each. Already-settled members are skipped. Review the figures in Salaries/Payouts before executing the payouts.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={runBatch}>Run settlement</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {runResult && (
                    <div className="rounded-lg border p-3 text-sm">
                      <p>Settled <span className="font-semibold">{runResult.done}</span>{runResult.failed.length > 0 && <>, <span className="font-semibold text-destructive">{runResult.failed.length} failed</span></>}.</p>
                      {runResult.failed.map((f, i) => <p key={i} className="text-xs text-destructive">{f.name}: {f.error}</p>)}
                    </div>
                  )}
                </div>
              )}
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      <GroupDialog open={dialog} onOpenChange={setDialog} editing={editing} onSaved={() => { reloadGroups(); reloadStaff(); }} />
    </div>
  );
}
