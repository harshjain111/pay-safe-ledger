import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Loader2, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Row {
  id: string;
  full_name: string;
  designation: string | null;
  department: string | null;
  attendance_tracked: boolean;
}

export function AttendanceCoverageCard() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!canManage) return;
    load();
  }, [canManage]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, designation, department, attendance_tracked' as never)
      .eq('is_active', true)
      .order('full_name');
    if (error) {
      toast.error('Failed to load staff');
    } else {
      setRows((data as unknown as Row[]) ?? []);
    }
    setLoading(false);
  };

  const toggle = async (id: string, value: boolean) => {
    const prev = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, attendance_tracked: value } : r)));
    const { error } = await supabase
      .from('staff')
      .update({ attendance_tracked: value } as never)
      .eq('id', id);
    if (error) {
      toast.error('Update failed');
      setRows(prev);
    } else {
      toast.success(value ? 'Now tracked' : 'Removed from attendance');
    }
  };

  if (!canManage) return null;

  const filtered = rows.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Attendance Coverage
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Choose which staff use this app for attendance. Turn OFF for staff who use a
          different app (e.g. club staff) — they won't see the check-in widget and
          won't be fined here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Search staff…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="rounded-lg border divide-y max-h-[420px] overflow-auto">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[r.designation, r.department].filter(Boolean).join(' • ') || '—'}
                  </p>
                </div>
                <Switch
                  checked={r.attendance_tracked}
                  onCheckedChange={(v) => toggle(r.id, v)}
                />
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No staff found.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
