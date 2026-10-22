import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBiometricEnrolment, type EnrolmentRow } from '@/hooks/useBiometricEnrolment';
import { getFaceProvider } from '@/lib/face';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/layout/EmptyState';
import { ErrorState } from '@/components/layout/ErrorState';
import { toast } from '@/lib/toast';
import { format } from 'date-fns';
import { Fingerprint, ScanFace, ShieldOff, Loader2, AlertTriangle } from 'lucide-react';

type Filter = 'pending' | 'enrolled' | 'all';
type Kind = 'fingerprint' | 'face';

const STATUS_TONE = {
  enrolled: 'green',
  pending: 'grey',
  failed: 'red',
  none: 'amber',
} as const;

const STATUS_LABEL = {
  enrolled: 'Enrolled',
  pending: 'Pending',
  failed: 'Failed',
  none: 'Not enrolled',
} as const;

export default function BiometricEnrolment() {
  const { user, isOwner, isAdmin, isHR } = useAuth();
  const canManage = isOwner || isAdmin || isHR;
  const { rows, total, enrolled, pending, unmatched, isLoading, error, reload } = useBiometricEnrolment();

  const [filter, setFilter] = useState<Filter>('pending');
  const [enrolTarget, setEnrolTarget] = useState<EnrolmentRow | null>(null);
  const [kind, setKind] = useState<Kind>('fingerprint');
  const [deviceUserId, setDeviceUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<EnrolmentRow | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'enrolled') return rows.filter((r) => r.status === 'enrolled');
    return rows.filter((r) => r.status !== 'enrolled');
  }, [rows, filter]);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Biometric Enrolment" />
        <EmptyState
          icon={ShieldOff}
          title="Not available"
          description="Biometric enrolment is managed by owners and admins."
        />
      </div>
    );
  }

  const openEnrol = (row: EnrolmentRow) => {
    setEnrolTarget(row);
    setKind((row.kind as Kind) || 'fingerprint');
    setDeviceUserId(row.deviceUserId ?? '');
  };

  const submitEnrol = async () => {
    if (!enrolTarget) return;
    const code = deviceUserId.trim();
    if (code && !/^[A-Za-z0-9_.-]{1,64}$/.test(code)) {
      toast.error('Device User ID can only contain letters, digits, dot, dash and underscore');
      return;
    }
    setSaving(true);
    try {
      // The number this person has on the terminal. Punches arrive with it.
      if (code !== (enrolTarget.deviceUserId ?? '')) {
        const { error: codeErr } = await supabase
          .from('staff')
          .update({ device_user_id: code || null })
          .eq('id', enrolTarget.staffId);
        if (codeErr) {
          throw new Error(
            codeErr.code === '23505'
              ? `Device User ID ${code} is already linked to someone else`
              : codeErr.message,
          );
        }
      }

      let faceVectorRef: string | null = null;
      let status: 'enrolled' | 'failed' = 'enrolled';
      if (kind === 'face') {
        const res = await getFaceProvider().enrol({ staffId: enrolTarget.staffId });
        if (res.ok) faceVectorRef = res.vectorRef ?? null;
        else status = 'failed';
      }
      const now = new Date().toISOString();
      const fields = {
        kind,
        status,
        enrolled_at: status === 'enrolled' ? now : null,
        face_vector_ref: faceVectorRef,
      };

      if (enrolTarget.enrolmentId) {
        const { error } = await supabase
          .from('biometric_enrolments')
          .update(fields)
          .eq('id', enrolTarget.enrolmentId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('biometric_enrolments').insert({
          staff_id: enrolTarget.staffId,
          device_id: null,
          created_by: user?.id ?? null,
          ...fields,
        });
        if (error) throw error;
      }

      toast[status === 'enrolled' ? 'success' : 'error'](
        status === 'enrolled'
          ? `${enrolTarget.fullName} enrolled`
          : `Face enrolment failed for ${enrolTarget.fullName}`,
      );

      // Punches the terminal sent for this User ID before it was linked.
      if (code) {
        const { data: replayed, error: replayErr } = await supabase.rpc('replay_unmatched_punches', {
          _staff_id: enrolTarget.staffId,
        });
        if (replayErr) toast.error(`Earlier punches not added: ${replayErr.message}`);
        else if (replayed && replayed > 0)
          toast.success(`${replayed} earlier punch${replayed === 1 ? '' : 'es'} added to attendance`);
      }
      setEnrolTarget(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not enrol staff');
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget?.enrolmentId) return;
    const { error } = await supabase
      .from('biometric_enrolments')
      .delete()
      .eq('id', removeTarget.enrolmentId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Enrolment removed for ${removeTarget.fullName}`);
      await reload();
    }
    setRemoveTarget(null);
  };

  const columns: DataTableColumn<EnrolmentRow>[] = [
    {
      id: 'name',
      header: 'Staff',
      sortable: true,
      sortAccessor: (r) => r.fullName,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">{r.fullName}</div>
          <div className="text-xs text-muted-foreground">{r.employeeId}</div>
        </div>
      ),
    },
    {
      id: 'deviceUserId',
      header: 'Device User ID',
      cell: (r) =>
        r.deviceUserId ? (
          <span className="font-mono text-sm">{r.deviceUserId}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'branch',
      header: 'Outlet',
      cell: (r) => <span className="text-sm text-muted-foreground">{r.outletName ?? 'Unassigned'}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: (r) => r.status,
      cell: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>,
    },
    {
      id: 'detail',
      header: 'Enrolled',
      cell: (r) =>
        r.status === 'enrolled' ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground capitalize">
            {r.kind === 'face' ? <ScanFace className="h-4 w-4" /> : <Fingerprint className="h-4 w-4" />}
            {r.kind}
            {r.enrolledAt && (
              <span className="text-xs">· {format(new Date(r.enrolledAt), 'd MMM yyyy')}</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  const rowActions = (r: EnrolmentRow) => (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant={r.status === 'enrolled' ? 'outline' : 'default'} onClick={() => openEnrol(r)}>
        {r.status === 'enrolled' ? 'Re-enrol' : 'Enrol'}
      </Button>
      {r.enrolmentId && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setRemoveTarget(r)}
        >
          Remove
        </Button>
      )}
    </div>
  );

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'pending', label: 'Pending', count: pending },
    { id: 'enrolled', label: 'Enrolled', count: enrolled },
    { id: 'all', label: 'All', count: total },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Biometric Enrolment"
        description="Track which attendance-tracked staff are enrolled for device punches."
      >
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{pending}</span> pending of {total}
        </div>
      </PageHeader>

      {unmatched.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              The device sent punches for User IDs that aren’t linked to anyone
            </p>
            <p className="text-muted-foreground">
              {unmatched
                .map(
                  (u) =>
                    `${u.deviceUserId} (${u.count} punch${u.count === 1 ? '' : 'es'}, last ${format(
                      new Date(u.lastAt),
                      'd MMM, h:mm a',
                    )})`,
                )
                .join(' · ')}
            </p>
            <p className="text-muted-foreground">
              Enrol the person below and enter their Device User ID. These punches are kept and will be
              added to their attendance.
            </p>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState title="Couldn't load enrolment data" description={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.staffId}
          isLoading={isLoading}
          rowActions={rowActions}
          actionsHeader="Action"
          toolbar={
            <div className="inline-flex items-center rounded-lg border border-border p-0.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  aria-pressed={filter === t.id}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    filter === t.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs opacity-70">{t.count}</span>
                </button>
              ))}
            </div>
          }
          emptyState={
            <EmptyState
              icon={Fingerprint}
              title={filter === 'pending' ? 'Everyone is enrolled' : 'No staff here'}
              description={
                filter === 'pending'
                  ? 'All attendance-tracked staff have a biometric enrolment.'
                  : 'No attendance-tracked staff match this view.'
              }
            />
          }
        />
      )}

      {/* Enrol dialog */}
      <Dialog open={!!enrolTarget} onOpenChange={(o) => !o && setEnrolTarget(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enrol {enrolTarget?.fullName}</DialogTitle>
            <DialogDescription>
              Records a global biometric enrolment so this staff member’s device punches are accepted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="enrol-device-user-id">
              Device User ID
            </label>
            <Input
              id="enrol-device-user-id"
              value={deviceUserId}
              onChange={(e) => setDeviceUserId(e.target.value)}
              placeholder={enrolTarget?.employeeId ?? 'e.g. 1'}
              inputMode="text"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              The User ID this person has on the attendance device. Leave empty if it is the same as
              their employee code ({enrolTarget?.employeeId}).
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="enrol-kind">
              Biometric type
            </label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger id="enrol-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="fingerprint">Fingerprint</SelectItem>
                <SelectItem value="face">Face</SelectItem>
              </SelectContent>
            </Select>
            {kind === 'face' && (
              <p className="pt-1 text-xs text-muted-foreground">
                Face enrolment stores only a vector reference (via the configured provider) — never a
                raw image.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrolTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitEnrol} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enrol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove enrolment?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.fullName}’s device punches will be rejected until they’re re-enrolled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
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
