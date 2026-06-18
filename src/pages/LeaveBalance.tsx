import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, SlidersHorizontal, FileSpreadsheet, Save, Loader2, Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterBar } from '@/components/layout/filter-bar';
import { StatusTabs } from '@/components/ui/status-tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { toAmount } from '@/lib/utils';
import { validateBalanceAdjustment } from '@/lib/leave-allocation';
import { listLeaveTypes, listBalances, bulkAdjustBalance, saveBalances, type LeaveType, type BalanceRow } from '@/lib/leave-service';
import { exportSheetsToExcel } from '@/lib/report-export';

interface StaffRow { id: string; employee_id: string; full_name: string; department: string | null; designation: string | null; status: string | null; is_active: boolean }

const statusOf = (s: StaffRow): string => s.status || (s.is_active ? 'active' : 'inactive');
const key = (staffId: string, typeId: string) => `${staffId}:${typeId}`;

export default function LeaveBalance() {
  const { isOwner, isAdmin, user } = useAuth();
  const canManage = isOwner || isAdmin;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'sheet'

  // bulk adjust
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState(false);
  const [leaveId, setLeaveId] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  // spreadsheet edits
  const [edits, setEdits] = useState<Map<string, number>>(new Map());
  const [savingSheet, setSavingSheet] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [{ data: st }, tp, bal] = await Promise.all([
        supabase.from('staff').select('id, employee_id, full_name, department, designation, status, is_active').order('full_name'),
        listLeaveTypes(),
        listBalances(),
      ]);
      setStaff((st ?? []) as StaffRow[]);
      setTypes(tp);
      setBalances(new Map(bal.map((b) => [key(b.staff_id, b.leave_type_id), Number(b.balance)])));
      setEdits(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.full_name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShown = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected((p) => {
    const n = new Set(p);
    if (allShown) filtered.forEach((s) => n.delete(s.id)); else filtered.forEach((s) => n.add(s.id));
    return n;
  });

  const openAdjust = () => {
    if (selected.size === 0) { toast.error('Please select at least one employee.'); return; }
    setLeaveId(''); setNewBalance(''); setComment(''); setModal(true);
  };

  const applyAdjust = async () => {
    const err = validateBalanceAdjustment({ leaveId, comment });
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      await bulkAdjustBalance({ staffIds: [...selected], leaveTypeId: leaveId, newBalance: toAmount(newBalance), comment: comment.trim(), userId: user?.id ?? null });
      toast.success(`Balance updated for ${selected.size} employee(s)`);
      setModal(false); setSelected(new Set());
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to adjust');
    } finally { setSaving(false); }
  };

  // spreadsheet helpers
  const cellValue = (sid: string, tid: string): string => {
    const k = key(sid, tid);
    if (edits.has(k)) return String(edits.get(k));
    return balances.has(k) ? String(balances.get(k)) : '';
  };
  const setCell = (sid: string, tid: string, raw: string) => {
    setEdits((p) => { const n = new Map(p); n.set(key(sid, tid), toAmount(raw)); return n; });
  };

  const saveSheet = async () => {
    if (edits.size === 0) { toast.message('No changes to save'); return; }
    setSavingSheet(true);
    try {
      const rows: BalanceRow[] = [...edits.entries()].map(([k, balance]) => {
        const [staff_id, leave_type_id] = k.split(':');
        return { staff_id, leave_type_id, balance };
      });
      await saveBalances(rows);
      toast.success(`Saved ${rows.length} balance change(s)`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSavingSheet(false); }
  };

  const exportExcel = () => {
    const headers = ['Employee ID', 'Name', 'Status', ...types.map((t) => t.code)];
    const rows = filtered.map((s) => [
      s.employee_id, s.full_name, statusOf(s),
      ...types.map((t) => (balances.has(key(s.id, t.id)) ? Number(balances.get(key(s.id, t.id))) : '')),
    ]);
    exportSheetsToExcel('Leave Balances', [{ name: 'Balances', headers, rows }]);
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can view and adjust leave balances." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Leave Balance" description="View and adjust per-employee leave balances.">
        {view === 'list'
          ? <Button onClick={openAdjust} disabled={selected.size === 0} className="gap-1.5"><SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Bulk Adjust</span> ({selected.size})</Button>
          : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportExcel} className="gap-1.5"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
              <Button onClick={saveSheet} disabled={savingSheet || edits.size === 0} className="gap-1.5"><Save className="h-4 w-4" /> Save{edits.size ? ` (${edits.size})` : ''}</Button>
            </div>
          )}
      </PageHeader>

      <StatusTabs value={view} onValueChange={setView} tabs={[{ value: 'list', label: 'Balances' }, { value: 'sheet', label: 'Bulk Update' }]} />
      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search staff…" />

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60">
                {view === 'list' && <TableHead className="w-10"><Checkbox checked={allShown} onCheckedChange={toggleAll} aria-label="Select all" /></TableHead>}
                <TableHead>Employee ID</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead>
                <TableHead>Designation</TableHead><TableHead>Status</TableHead>
                {types.map((t) => <TableHead key={t.id} className="text-center whitespace-nowrap">{t.code}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6 + types.length} className="p-0"><EmptyState icon={Scale} title="No staff" description="No staff to show." /></TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id} className="even:bg-muted/30">
                  {view === 'list' && <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={`Select ${s.full_name}`} /></TableCell>}
                  <TableCell className="text-sm">{s.employee_id}</TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.department || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.designation || '—'}</TableCell>
                  <TableCell><StatusBadge status={statusOf(s)} /></TableCell>
                  {types.map((t) => {
                    const has = balances.has(key(s.id, t.id));
                    return (
                      <TableCell key={t.id} className="text-center">
                        {view === 'sheet'
                          ? <Input type="number" step="0.5" value={cellValue(s.id, t.id)} onChange={(e) => setCell(s.id, t.id, e.target.value)} className="h-8 w-20 mx-auto text-center" />
                          : has ? Number(balances.get(key(s.id, t.id))) : <span className="text-xs text-muted-foreground/60">Not Assigned</span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Adjust Leave Balance</DialogTitle>
            <DialogDescription>Overwrites the chosen type's balance for {selected.size} selected employee(s) and records an audit entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Choose Leave *</Label>
              <Select value={leaveId} onValueChange={setLeaveId}>
                <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                <SelectContent className="bg-popover">{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Update Leave Balance Count *</Label><Input type="number" step="0.5" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Remarks *</Label><Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Mandatory reason for this adjustment" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={applyAdjust} disabled={saving}>{saving ? 'Saving…' : 'Apply'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
