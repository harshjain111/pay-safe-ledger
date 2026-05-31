import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Shift, ShiftAssignment, fetchShifts, fetchAssignments } from '@/lib/discipline';
import { toast } from '@/lib/toast';
import { Plus, Loader2, Clock } from 'lucide-react';

interface StaffLite {
  id: string;
  full_name: string;
  designation: string | null;
  attendance_tracked: boolean;
}

export default function Shifts() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [name, setName] = useState('');
  const [checkIn, setCheckIn] = useState('16:00');
  const [checkOut, setCheckOut] = useState('02:00');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [s, a, st] = await Promise.all([
      fetchShifts(),
      fetchAssignments(),
      supabase
        .from('staff')
        .select('id, full_name, designation, attendance_tracked' as never)
        .eq('is_active', true)
        .order('full_name'),
    ]);
    setShifts(s);
    setAssignments(a);
    setStaff((st.data as unknown as StaffLite[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (canManage) load();
  }, [canManage]);

  if (!canManage) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">You don't have access to this page.</p>
      </div>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCheckIn('16:00');
    setCheckOut('02:00');
    setDialogOpen(true);
  };
  const openEdit = (s: Shift) => {
    setEditing(s);
    setName(s.name);
    setCheckIn(s.check_in_time.slice(0, 5));
    setCheckOut(s.check_out_time.slice(0, 5));
    setDialogOpen(true);
  };

  const saveShift = async () => {
    if (!name.trim()) return toast.error('Shift name required');
    const payload = { name, check_in_time: checkIn, check_out_time: checkOut } as never;
    try {
      setSaving(true);
      if (editing) {
        const { error } = await supabase
          .from('shifts' as never)
          .update(payload)
          .eq('id', editing.id);
        if (error) return toast.error(error.message);
      } else {
        const { error } = await supabase.from('shifts' as never).insert(payload);
        if (error) return toast.error(error.message);
      }
      toast.success('Saved');
      setDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const assignShift = async (staffId: string, shiftId: string | null) => {
    const existing = assignments.find((a) => a.staff_id === staffId);
    if (existing) {
      const { error } = await supabase
        .from('staff_shift_assignments' as never)
        .update({ shift_id: shiftId } as never)
        .eq('id', existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from('staff_shift_assignments' as never)
        .insert({ staff_id: staffId, shift_id: shiftId } as never);
      if (error) return toast.error(error.message);
    }
    load();
  };

  const setOverride = async (
    staffId: string,
    field: 'override_check_in' | 'override_check_out',
    value: string,
  ) => {
    const existing = assignments.find((a) => a.staff_id === staffId);
    const v = value ? value : null;
    if (existing) {
      await supabase
        .from('staff_shift_assignments' as never)
        .update({ [field]: v } as never)
        .eq('id', existing.id);
    } else {
      await supabase
        .from('staff_shift_assignments' as never)
        .insert({ staff_id: staffId, [field]: v } as never);
    }
    load();
  };

  const trackedStaff = staff.filter((s) => s.attendance_tracked);
  const memberCount = (shiftId: string) =>
    assignments.filter((a) => a.shift_id === shiftId).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shifts"
        description="Create shifts and assign staff. Set per-staff overrides if needed."
      />

      <Tabs defaultValue="shifts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="grid">Staff Grid</TabsTrigger>
        </TabsList>

        <TabsContent value="shifts" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> New Shift
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? 'Edit Shift' : 'New Shift'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Evening 4pm-2am"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Check-in time</Label>
                      <Input
                        type="time"
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Check-out time</Label>
                      <Input
                        type="time"
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    If check-out is earlier than check-in (e.g. 02:00), it's treated as
                    the next day.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={saveShift} disabled={saving}>
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {shifts.map((s) => (
                <Card key={s.id} className="rounded-2xl border-0 shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" /> {s.name}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {s.check_in_time.slice(0, 5)} → {s.check_out_time.slice(0, 5)}
                        </p>
                        <Badge variant="secondary" className="mt-2">
                          {memberCount(s.id)} staff
                        </Badge>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {shifts.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full text-center py-8">
                  No shifts yet. Create one to assign staff.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="grid" className="space-y-3">
          <Card className="rounded-2xl border-0 shadow-card">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-3">Staff</th>
                    <th className="text-left p-3">Shift</th>
                    <th className="text-left p-3">Override in</th>
                    <th className="text-left p-3">Override out</th>
                  </tr>
                </thead>
                <tbody>
                  {trackedStaff.map((st) => {
                    const a = assignments.find((x) => x.staff_id === st.id);
                    return (
                      <tr key={st.id} className="border-t">
                        <td className="p-3">
                          <p className="font-medium">{st.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {st.designation ?? '—'}
                          </p>
                        </td>
                        <td className="p-3">
                          <Select
                            value={a?.shift_id ?? 'none'}
                            onValueChange={(v) =>
                              assignShift(st.id, v === 'none' ? null : v)
                            }
                          >
                            <SelectTrigger className="h-9 w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— No shift —</SelectItem>
                              {shifts.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Input
                            type="time"
                            defaultValue={a?.override_check_in?.slice(0, 5) ?? ''}
                            onBlur={(e) =>
                              setOverride(st.id, 'override_check_in', e.target.value)
                            }
                            className="h-9 w-[120px]"
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="time"
                            defaultValue={a?.override_check_out?.slice(0, 5) ?? ''}
                            onBlur={(e) =>
                              setOverride(st.id, 'override_check_out', e.target.value)
                            }
                            className="h-9 w-[120px]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {trackedStaff.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No tracked staff. Enable attendance for staff in Settings →
                        Attendance Coverage.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
