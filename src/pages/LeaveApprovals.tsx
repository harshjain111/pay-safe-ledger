import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarCheck, CheckCircle2, Inbox, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader, DataTable, EmptyState, InlineNote, type DataTableColumn } from '@/components/patterns';
import { ScopeFilters, scopeMatches, EMPTY_SCOPE, type StaffScope } from '@/components/common/ScopeFilters';
import { LeaveApprovalDialog } from '@/components/leave/LeaveApprovalDialog';
import { StatusTabs, DEFAULT_STATUS_TABS } from '@/components/ui/status-tabs';
import type { LeaveRecord, LeaveStatus } from '@/types/leave';

// ---------------------------------------------------------------------------
// Approve Leave — the queue for leave the staff app raised.
//
// Employees request leave from their own app; until now the only place to act
// on it was a card on a manager's dashboard, so an owner, admin or HR had to
// know to open Leave Records and filter to Pending. This is that queue as a
// page, gated on leave.approve so an owner decides who gets it from Rights
// Templates rather than it being wired to a role.
//
// The decision itself is unchanged: LeaveApprovalDialog is the same component
// the dashboard card and Leave Records use, so leave is approved one way.
// Who can SEE which rows stays with RLS — a manager's query returns their
// reports, an owner's returns everyone.
// ---------------------------------------------------------------------------

interface Row extends LeaveRecord {
  staffName: string;
  employeeCode: string;
}

export default function LeaveApprovals() {
  const { staffData, user, isOwner, can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<StaffScope>(EMPTY_SCOPE);
  const [status, setStatus] = useState<LeaveStatus | 'all'>('pending');
  const [selected, setSelected] = useState<LeaveRecord | null>(null);

  const canApprove = isOwner || can('leave.approve');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('leave_records')
        .select('*, staff:staff_id ( id, full_name, employee_id, user_id, reporting_manager_id, is_manager, department, outlet_id )')
        .order('leave_date', { ascending: true });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;

      const all = ((data as unknown as LeaveRecord[]) ?? []).filter((r) => {
        // Nobody decides their own leave — the same guard the dashboard card applies.
        if (r.staff?.user_id && r.staff.user_id === user?.id) return false;
        return true;
      });

      setRows(all.map((r) => ({
        ...r,
        staffName: r.staff?.full_name ?? 'Unknown',
        employeeCode: r.staff?.employee_id ?? '—',
      })));
    } finally {
      setLoading(false);
    }
  }, [status, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => rows.filter((r) => scopeMatches(scope, r.staff as { department?: string | null; outlet_id?: string | null } | undefined)),
    [rows, scope],
  );

  // The department/outlet options come from the staff actually in the queue,
  // so the filters never offer a scope with nothing behind it.
  const scopeStaff = useMemo(
    () => rows.map((r) => ({
      department: (r.staff as { department?: string | null } | undefined)?.department ?? null,
      outlet_id: (r.staff as { outlet_id?: string | null } | undefined)?.outlet_id ?? null,
    })),
    [rows],
  );

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const statusBadge = (s: LeaveStatus) =>
    s === 'approved' ? <Badge>Approved</Badge>
      : s === 'rejected' ? <Badge variant="destructive">Rejected</Badge>
        : <Badge variant="outline">Pending</Badge>;

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'staff', header: 'Employee',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.staffName}</div>
          <div className="truncate text-xs text-muted-foreground">{r.employeeCode}</div>
        </div>
      ),
    },
    { key: 'date', header: 'Leave Date', render: (r) => format(parseISO(r.leave_date), 'dd MMM yyyy') },
    { key: 'reason', header: 'Reason', render: (r) => r.remarks || '—' },
    { key: 'status', header: 'Status', align: 'center', render: (r) => statusBadge(r.status) },
    {
      key: 'action', header: '', align: 'right',
      render: (r) => (
        r.status === 'pending' && canApprove ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs whitespace-nowrap"
            onClick={() => setSelected(r)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Review
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approve Leave"
        description="Leave requested from the employee app — approve or decline it here."
        count={loading ? undefined : visible.length}
        actions={
          pendingCount > 0 ? (
            <span className="rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
              {pendingCount} pending
            </span>
          ) : undefined
        }
      />

      {!canApprove && (
        <InlineNote>
          You can see leave requests here but cannot decide them — that needs the
          "Approve leave" right, which an owner grants from Rights Templates.
        </InlineNote>
      )}

      <StatusTabs
        value={status}
        onValueChange={(v) => setStatus(v as LeaveStatus | 'all')}
        tabs={DEFAULT_STATUS_TABS}
      />

      <ScopeFilters staff={scopeStaff} value={scope} onChange={setScope} />

      {loading ? null : visible.length === 0 ? (
        <EmptyState
          icon={status === 'pending' ? CalendarCheck : Inbox}
          title={status === 'pending' ? 'No leave awaiting a decision' : 'Nothing to show'}
          instruction={
            status === 'pending'
              ? 'Leave requested from the employee app arrives here for approval.'
              : 'Change the status tabs above to see other leave records.'
          }
        />
      ) : (
        <DataTable<Row>
          rows={visible}
          columns={columns}
          rowKey={(r) => r.id}
        />
      )}

      <LeaveApprovalDialog
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        leaveRecord={selected}
        onSuccess={() => { setSelected(null); void load(); }}
      />
    </div>
  );
}
