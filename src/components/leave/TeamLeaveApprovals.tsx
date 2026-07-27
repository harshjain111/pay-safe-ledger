import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import type { LeaveRecord } from '@/types/leave';
import { LeaveApprovalDialog } from '@/components/leave/LeaveApprovalDialog';

/**
 * Manager's inbox: pending leave requests raised by their direct reports.
 * RLS ("Managers view/approve reports leave") scopes what's visible/updatable;
 * we additionally filter to this manager's reports and exclude the manager's own
 * rows. The approver assigns the leave type in LeaveApprovalDialog.
 */
export function TeamLeaveApprovals() {
  const { staffData, user } = useAuth();
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LeaveRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetch = useCallback(async () => {
    if (!staffData?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('leave_records')
      .select('*, staff:staff_id ( id, full_name, employee_id, user_id, reporting_manager_id, is_manager )')
      .eq('status', 'pending')
      .order('leave_date', { ascending: true });
    if (!error) {
      const reports = ((data as unknown as LeaveRecord[]) || []).filter(
        (r) => r.staff?.reporting_manager_id === staffData.id && r.staff?.user_id !== user?.id,
      );
      setRecords(reports);
    }
    setLoading(false);
  }, [staffData?.id, user?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  // Don't clutter the dashboard when there's nothing to action.
  if (loading || records.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-5 w-5 text-primary" />
            Team Leave Approvals
            <Badge variant="secondary" className="ml-auto">{records.length}</Badge>
          </CardTitle>
          <CardDescription>Leave requests from your team, awaiting your review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-md border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.staff?.full_name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />
                  {format(new Date(r.leave_date), 'EEE, dd MMM yyyy')}
                  {r.remarks ? ` · ${r.remarks}` : ''}
                </p>
              </div>
              <Button size="sm" onClick={() => { setSelected(r); setDialogOpen(true); }}>Review</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <LeaveApprovalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leaveRecord={selected}
        onSuccess={fetch}
      />
    </>
  );
}
