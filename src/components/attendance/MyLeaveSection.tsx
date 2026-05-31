import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/layout/EmptyState';
import { CreateLeaveDialog } from '@/components/leave/CreateLeaveDialog';
import { Calendar, Plus, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { LeaveRecord, LeaveStatus } from '@/types/leave';
import { cn } from '@/lib/utils';

export function MyLeaveSection() {
  const { staffData } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchLeaves = async () => {
    if (!staffData?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_records')
        .select('*')
        .eq('staff_id', staffData.id)
        .order('leave_date', { ascending: false })
        .limit(60);
      if (error) throw error;
      setLeaves((data as unknown as LeaveRecord[]) ?? []);
    } catch (e) {
      console.error('Leaves load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffData?.id]);

  const getStatusIcon = (s: LeaveStatus) => {
    if (s === 'pending') return <Clock className="h-4 w-4" />;
    if (s === 'approved') return <CheckCircle className="h-4 w-4" />;
    return <XCircle className="h-4 w-4" />;
  };

  if (!staffData?.id) {
    return (
      <Card className="rounded-2xl border-0 shadow-card">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Leave management is available for staff accounts.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">My Leaves</h2>
          <p className="text-xs text-muted-foreground">Recent leave requests and approvals</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Request Leave
        </Button>
      </div>

      <Card className="rounded-2xl border-0 shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : leaves.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No leaves yet"
              description="Need time off? Submit a leave request."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Request Leave
                </Button>
              }
            />
          ) : (
            <div className="divide-y">
              {leaves.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{format(new Date(r.leave_date), 'EEE, dd MMM yyyy')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.leave_type === 'paid' ? 'Paid leave' : 'Leave'}
                      {r.deduction_days > 0 && (
                        <>
                          {' · '}
                          <span className="text-destructive">-{r.deduction_days}d salary</span>
                        </>
                      )}
                    </p>
                    {r.remarks && (
                      <p className="text-xs text-muted-foreground mt-1 italic">"{r.remarks}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(r.status)}
                    <span
                      className={cn(
                        'text-sm font-medium',
                        r.status === 'pending' && 'text-warning',
                        r.status === 'approved' && 'text-success',
                        r.status === 'rejected' && 'text-destructive',
                      )}
                    >
                      {r.status === 'pending' ? 'Waiting' : r.status === 'approved' ? 'Approved' : 'Declined'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateLeaveDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={fetchLeaves}
        staffId={staffData.id}
      />
    </div>
  );
}
