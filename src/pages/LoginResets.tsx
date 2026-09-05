import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader, DataTable, Drawer, EmptyState, InlineNote, type DataTableColumn } from '@/components/patterns';
import { StatusTabs, DEFAULT_STATUS_TABS } from '@/components/ui/status-tabs';
import { toast } from '@/lib/toast';
import {
  approveLoginResetRequest,
  rejectLoginResetRequest,
  DEFAULT_RESET_PASSWORD,
} from '@/lib/login-reset';
import { refetchNotificationCounts } from '@/hooks/useNotificationCounts';
import type { LoginResetRequest } from '@/types/database';

// ---------------------------------------------------------------------------
// Login Resets — someone cannot get into their account.
//
// Split out of the shared approvals inbox, where it sat alongside advance
// requests. They are not the same job: an advance is money and is decided by
// whoever holds approvals.approve (owner, admin, HR), while approving a reset
// actually CHANGES SOMEONE'S CREDENTIALS through an owner-only edge function.
// Merged into one table, HR saw rows they could never act on, and the table
// needed a Type column and an Amount column reading "—" to paper over the
// difference.
//
// Owner-only, matching the server: reset-user-password asserts owner, so
// showing this to anyone else would be showing them a button that cannot work.
// ---------------------------------------------------------------------------

type Row = LoginResetRequest & {
  staffName: string;
  employeeCode: string;
};

export default function LoginResets() {
  const { user, staffData, isOwner } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [approving, setApproving] = useState<Row | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!isOwner) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('login_reset_requests')
        .select('*, staff:staff_id ( id, user_id, full_name, employee_id )')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(((data ?? []) as unknown as LoginResetRequest[]).map((r) => ({
        ...r,
        staffName: r.staff?.full_name ?? 'Staff',
        employeeCode: r.staff?.employee_id ?? '—',
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load login-reset requests');
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => { void load(); }, [load]);

  const after = () => { refetchNotificationCounts(); void load(); };

  const visible = useMemo(
    () => rows.filter((r) => tab === 'all' || r.status === tab),
    [rows, tab],
  );
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const doApprove = async (row: Row) => {
    setBusyId(row.id);
    try {
      await approveLoginResetRequest({ request: row, user, staffData });
      toast.success('Password reset and the employee notified');
      setApproving(null);
      after();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset the login');
    } finally {
      setBusyId(null);
    }
  };

  const doReject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await rejectLoginResetRequest({ request: rejecting, reason: rejectReason, user, staffData });
      toast.success('Request rejected');
      setRejectReason('');
      setRejecting(null);
      after();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (s: string) =>
    s === 'approved' ? <Badge>Reset done</Badge>
      : s === 'rejected' ? <Badge variant="destructive">Rejected</Badge>
        : <Badge variant="outline">Pending</Badge>;

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'who', header: 'Employee',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.staffName}</div>
          <div className="truncate text-xs text-muted-foreground">{r.employeeCode}</div>
        </div>
      ),
    },
    { key: 'reason', header: 'Reason given', render: (r) => r.reason || '—' },
    {
      key: 'raised', header: 'Raised',
      render: (r) => (r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'),
    },
    { key: 'status', header: 'Status', align: 'center', render: (r) => statusBadge(r.status) },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        r.status === 'pending' ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs whitespace-nowrap"
              disabled={busyId === r.id}
              onClick={() => setApproving(r)}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Reset password
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              disabled={busyId === r.id}
              onClick={() => { setRejectReason(''); setRejecting(r); }}
            >
              Reject
            </Button>
          </div>
        ) : null
      ),
    },
  ];

  if (!isOwner) {
    return (
      <div className="space-y-4">
        <PageHeader title="Login Resets" />
        <EmptyState
          icon={ShieldCheck}
          title="Owners only"
          instruction="Resetting a password runs through an owner-only function. Ask an owner to action these."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Login Resets"
        description="Staff who cannot get into their account — approving one sets a new password immediately."
        count={loading ? undefined : visible.length}
        actions={
          pendingCount > 0 ? (
            <span className="rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
              {pendingCount} pending
            </span>
          ) : undefined
        }
      />

      <StatusTabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        tabs={DEFAULT_STATUS_TABS}
      />

      {loading ? null : visible.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={tab === 'pending' ? 'Nothing waiting' : 'Nothing to show'}
          instruction={
            tab === 'pending'
              ? 'Requests raised from the employee app appear here.'
              : 'Use the tabs above to see other requests.'
          }
        />
      ) : (
        <DataTable<Row> rows={visible} columns={columns} rowKey={(r) => r.id} />
      )}

      {/* Approve — this performs the reset, so it says exactly what will happen. */}
      <Drawer
        open={!!approving}
        onOpenChange={(o) => { if (!o) setApproving(null); }}
        title={approving ? `Reset the password for ${approving.staffName}?` : ''}
        footer={
          <Button
            onClick={() => approving && doApprove(approving)}
            disabled={busyId === approving?.id}
            className="gap-2"
          >
            <KeyRound className="h-4 w-4" />
            {busyId === approving?.id ? 'Resetting…' : 'Reset password'}
          </Button>
        }
      >
        {approving && (
          <div className="space-y-3 text-sm">
            <p>
              Their password becomes <strong>{DEFAULT_RESET_PASSWORD}</strong> straight away and they
              are notified. Tell them to change it from Settings once they are back in.
            </p>
            <InlineNote>
              This takes effect immediately — it is not a request that someone else confirms later.
            </InlineNote>
          </div>
        )}
      </Drawer>

      {/* Reject — reason is recorded on the request and in the audit log. */}
      <Drawer
        open={!!rejecting}
        onOpenChange={(o) => { if (!o) setRejecting(null); }}
        title={rejecting ? `Reject ${rejecting.staffName}'s request?` : ''}
        footer={
          <Button
            variant="destructive"
            onClick={doReject}
            disabled={busyId === rejecting?.id || !rejectReason.trim()}
          >
            {busyId === rejecting?.id ? 'Rejecting…' : 'Reject request'}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why this is being turned down…"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Recorded on the request and in the audit log, and shown to the employee.
          </p>
        </div>
      </Drawer>
    </div>
  );
}
