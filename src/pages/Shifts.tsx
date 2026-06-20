import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, ShieldAlert, Clock, Loader2, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  listShifts, getShiftTimings, saveShift, setShiftActive, getWorkingHourConfig, saveWorkingHourConfig,
  type ShiftRow, type ShiftTiming, type WorkingHourConfig,
} from '@/lib/shift-roster-service';
import type { AttendanceMode } from '@/lib/shift-roster';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SWATCHES = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
const MODES: { value: AttendanceMode; label: string }[] = [
  { value: 'ALL_PUNCH', label: 'All punches' },
  { value: 'FIRST_LAST_ONLY', label: 'First & last only' },
  { value: 'SINGLE_PUNCH_FULL', label: 'Single punch = full' },
  { value: 'DEFAULT_FULL', label: 'Any presence = full' },
];
const hhmmToMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const minToHHMM = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

interface Row { start: string; end: string; break_start: string; break_end: string }
const emptyRow = (): Row => ({ start: '', end: '', break_start: '', break_end: '' });

function ShiftForm({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: ShiftRow | null; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [color, setColor] = useState(SWATCHES[3]);
  const [description, setDescription] = useState('');
  const [isOneTime, setIsOneTime] = useState(true);
  const [hasBreak, setHasBreak] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(Array.from({ length: 7 }, emptyRow));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name); setAlias(editing.alias ?? ''); setColor(editing.color ?? SWATCHES[3]);
      setDescription(editing.description ?? ''); setIsOneTime(editing.is_one_time_all_days);
      setHasBreak(editing.has_break); setIsOpen(editing.is_open);
      getShiftTimings(editing.id).then((ts) => {
        const next = Array.from({ length: 7 }, emptyRow);
        for (const t of ts) next[t.weekday] = { start: t.start_time?.slice(0, 5) ?? '', end: t.end_time?.slice(0, 5) ?? '', break_start: t.break_start?.slice(0, 5) ?? '', break_end: t.break_end?.slice(0, 5) ?? '' };
        setRows(next);
      });
    } else {
      setName(''); setAlias(''); setColor(SWATCHES[3]); setDescription('');
      setIsOneTime(true); setHasBreak(false); setIsOpen(false); setRows(Array.from({ length: 7 }, emptyRow));
    }
  }, [open, editing]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const netHours = (r: Row): string => {
    if (!r.start || !r.end) return '';
    let mins = hhmmToMin(r.end) - hhmmToMin(r.start);
    if (hasBreak && r.break_start && r.break_end) mins -= hhmmToMin(r.break_end) - hhmmToMin(r.break_start);
    return mins > 0 ? `${(mins / 60).toFixed(2)} h` : '';
  };

  const submit = async () => {
    if (!name.trim()) { toast.error('Shift Name is required'); return; }
    setSaving(true);
    try {
      let timings: ShiftTiming[] = [];
      if (!isOpen) {
        const source = isOneTime ? Array.from({ length: 7 }, () => rows[0]) : rows;
        timings = source.map((r, wd) => ({
          weekday: wd,
          start_time: r.start || null, end_time: r.end || null,
          break_start: hasBreak ? r.break_start || null : null,
          break_end: hasBreak ? r.break_end || null : null,
        })).filter((t) => t.start_time && t.end_time);
      }
      await saveShift({ id: editing?.id, name: name.trim(), alias: alias.trim() || null, color, description: description.trim() || null, is_one_time_all_days: isOneTime, has_break: hasBreak, is_open: isOpen, timings });
      toast.success(editing ? 'Shift updated' : 'Shift created');
      onSaved(); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  const dayRows = isOneTime ? [0] : [0, 1, 2, 3, 4, 5, 6];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Shift' : 'Create Shift'}</DialogTitle>
          <DialogDescription>Timings per weekday, optional breaks, and a colour for grids.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Shift Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Alias</Label><Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. EVE" /></div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={isOpen} onCheckedChange={setIsOpen} /> Open Shift (no fixed time)</label>
            <label className={cn('flex items-center gap-2 text-sm', isOpen && 'opacity-40')}><Switch checked={isOneTime} disabled={isOpen} onCheckedChange={setIsOneTime} /> One time for all days</label>
            <label className={cn('flex items-center gap-2 text-sm', isOpen && 'opacity-40')}><Switch checked={hasBreak} disabled={isOpen} onCheckedChange={setHasBreak} /> Add break time</label>
          </div>

          {!isOpen && (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-secondary/60">
                  <TableHead className="w-16">Day</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
                  {hasBreak && <><TableHead>Break start</TableHead><TableHead>Break end</TableHead></>}
                  <TableHead className="text-right">Net</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dayRows.map((wd) => (
                    <TableRow key={wd}>
                      <TableCell className="text-sm font-medium">{isOneTime ? 'All' : WEEKDAYS[wd]}</TableCell>
                      <TableCell className="p-1"><Input type="time" className="h-8" value={rows[wd].start} onChange={(e) => setRow(wd, { start: e.target.value })} /></TableCell>
                      <TableCell className="p-1"><Input type="time" className="h-8" value={rows[wd].end} onChange={(e) => setRow(wd, { end: e.target.value })} /></TableCell>
                      {hasBreak && <>
                        <TableCell className="p-1"><Input type="time" className="h-8" value={rows[wd].break_start} onChange={(e) => setRow(wd, { break_start: e.target.value })} /></TableCell>
                        <TableCell className="p-1"><Input type="time" className="h-8" value={rows[wd].break_end} onChange={(e) => setRow(wd, { break_end: e.target.value })} /></TableCell>
                      </>}
                      <TableCell className="text-right text-xs text-muted-foreground">{netHours(rows[wd])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Choose Shift Colour *</Label>
            <div className="flex gap-2">
              {SWATCHES.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={cn('h-7 w-7 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')} style={{ backgroundColor: c }} />)}
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Remark</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create shift'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkingHoursModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [full, setFull] = useState('06:00');
  const [half, setHalf] = useState('04:00');
  const [mode, setMode] = useState<AttendanceMode>('ALL_PUNCH');
  const [shiftWise, setShiftWise] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getWorkingHourConfig().then((c) => {
      setFull(minToHHMM(c.full_day_minutes)); setHalf(minToHHMM(c.half_day_minutes));
      setMode(c.attendance_mode); setShiftWise(c.is_shift_wise_work_hrs);
    });
  }, [open]);

  const submit = async () => {
    const cfg: WorkingHourConfig = { full_day_minutes: hhmmToMin(full), half_day_minutes: hhmmToMin(half), attendance_mode: mode, is_shift_wise_work_hrs: shiftWise };
    if (cfg.half_day_minutes > cfg.full_day_minutes) { toast.error('Half-day hours cannot exceed full-day hours'); return; }
    setSaving(true);
    try { await saveWorkingHourConfig(cfg, user?.id ?? null); toast.success('Working hours saved — effective from tomorrow'); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Working Hours</DialogTitle>
          <DialogDescription>How punches are scored into Full / Half / Absent. Changes take effect from the next day.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <label className="flex items-center justify-between text-sm"><span>Shift-wise working hours</span><Switch checked={shiftWise} onCheckedChange={setShiftWise} /></label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Full Day Working Hours</Label><Input type="time" value={full} onChange={(e) => setFull(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Half Working Day Hours</Label><Input type="time" value={half} onChange={(e) => setHalf(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Attendance Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as AttendanceMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Shifts() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [timings, setTimings] = useState<Map<string, ShiftTiming[]>>(new Map());
  const [assigned, setAssigned] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [whOpen, setWhOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await listShifts();
      setShifts(list);
      const [{ data: allT }, { data: asn }] = await Promise.all([
        supabase.from('shift_day_timing').select('shift_id, weekday, start_time, end_time, break_start, break_end'),
        supabase.from('shift_assignment').select('shift_id'),
      ]);
      const tMap = new Map<string, ShiftTiming[]>();
      for (const t of (allT ?? []) as (ShiftTiming & { shift_id: string })[]) { if (!tMap.has(t.shift_id)) tMap.set(t.shift_id, []); tMap.get(t.shift_id)!.push(t); }
      setTimings(tMap);
      const aMap = new Map<string, number>();
      for (const a of (asn ?? []) as { shift_id: string | null }[]) if (a.shift_id) aMap.set(a.shift_id, (aMap.get(a.shift_id) ?? 0) + 1);
      setAssigned(aMap);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (canManage) reload(); else setLoading(false); }, [canManage]);

  const timeFor = useMemo(() => (shiftId: string, wd: number): string => {
    const t = timings.get(shiftId)?.find((x) => x.weekday === wd);
    if (!t || !t.start_time) return '—';
    return `${t.start_time.slice(0, 5)}–${t.end_time?.slice(0, 5) ?? ''}`;
  }, [timings]);

  const remove = async (s: ShiftRow) => {
    try { await setShiftActive(s.id, false); toast.success('Shift removed'); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to remove'); }
  };

  if (!canManage) return <EmptyState icon={ShieldAlert} title="Access Denied" description="Only owners and admins can manage shifts." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Shifts" description="Master of shift timings + working-hour scoring config.">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setWhOpen(true)} className="gap-1.5"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Set Working Hours</span></Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New shift</span></Button>
        </div>
      </PageHeader>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : shifts.length === 0 ? <EmptyState icon={Clock} title="No shifts" description="Create a shift to schedule staff." />
        : (
          <div className="rounded-xl border overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60">
                  <TableHead>Shift</TableHead>
                  {WEEKDAYS.map((d) => <TableHead key={d} className="text-center text-xs whitespace-nowrap">{d}</TableHead>)}
                  <TableHead className="text-right">Assigned</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((s) => (
                  <TableRow key={s.id} className="even:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color ?? '#64748b' }} />
                        <span className="font-medium whitespace-nowrap">{s.name}</span>
                        {s.is_open && <Badge variant="secondary" className="text-[10px]">Open</Badge>}
                      </div>
                    </TableCell>
                    {WEEKDAYS.map((_, wd) => <TableCell key={wd} className="text-center text-[11px] text-muted-foreground whitespace-nowrap">{s.is_open ? 'Open' : timeFor(s.id, wd)}</TableCell>)}
                    <TableCell className="text-right">{assigned.get(s.id) ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(s.created_at ?? Date.now()), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => { setEditing(s); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Remove {s.name}?</AlertDialogTitle><AlertDialogDescription>The shift is deactivated (kept for history).</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(s)}>Remove</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      <ShiftForm open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={reload} />
      <WorkingHoursModal open={whOpen} onOpenChange={setWhOpen} />
    </div>
  );
}
