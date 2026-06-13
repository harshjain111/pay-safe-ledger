import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBiometricDevices,
  isDeviceOnline,
  type BiometricDevice,
  type DeviceType,
} from '@/hooks/useBiometricDevices';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { formatDistanceToNow } from 'date-fns';
import {
  Fingerprint,
  ScanFace,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Copy,
  Loader2,
} from 'lucide-react';

const OUTLET_NONE = 'none';
const INGEST_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ingest-punches`;

interface FormState {
  label: string;
  serial: string;
  type: DeviceType;
  outletId: string; // OUTLET_NONE or an outlet id
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  label: '',
  serial: '',
  type: 'fingerprint',
  outletId: OUTLET_NONE,
  isActive: true,
};

export function BiometricDevicesCard() {
  const { user, isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const { devices, loading, error, reload } = useBiometricDevices(canManage);

  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase
      .from('outlets')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setOutlets(data ?? []));
  }, []);
  const outletName = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of outlets) m.set(o.id, o.name);
    return m;
  }, [outlets]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BiometricDevice | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [keyDialog, setKeyDialog] = useState<{ open: boolean; apiKey: string; label: string }>({
    open: false,
    apiKey: '',
    label: '',
  });
  const [regenTarget, setRegenTarget] = useState<BiometricDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BiometricDevice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!canManage) return null;

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const openEdit = (d: BiometricDevice) => {
    setEditing(d);
    setForm({
      label: d.label,
      serial: d.serial ?? '',
      type: d.type,
      outletId: d.outlet_id ?? OUTLET_NONE,
      isActive: d.is_active,
    });
    setFormOpen(true);
  };

  const generateKey = async (deviceId: string, label: string) => {
    setBusyId(deviceId);
    try {
      const { data, error } = await supabase.functions.invoke('rotate-device-key', {
        body: { device_id: deviceId },
      });
      if (error) throw error;
      const apiKey = (data as { api_key?: string })?.api_key;
      if (!apiKey) throw new Error('No key returned');
      setKeyDialog({ open: true, apiKey, label });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate key');
    } finally {
      setBusyId(null);
    }
  };

  const submitForm = async () => {
    if (!form.label.trim()) {
      toast.error('Device label is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        serial: form.serial.trim() || null,
        type: form.type,
        outlet_id: form.outletId === OUTLET_NONE ? null : form.outletId,
      };

      if (editing) {
        const { error } = await supabase
          .from('biometric_devices')
          .update({ ...payload, is_active: form.isActive })
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Device updated');
        setFormOpen(false);
        await reload();
      } else {
        const { data, error } = await supabase
          .from('biometric_devices')
          .insert({ ...payload, created_by: user?.id ?? null })
          .select('id')
          .single();
        if (error) throw error;
        setFormOpen(false);
        await reload();
        // Provision the device's first API key and show it once.
        await generateKey(data.id, payload.label);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save device';
      toast.error(msg.includes('duplicate') ? 'That serial number is already registered' : msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('biometric_devices').delete().eq('id', deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Device removed');
      await reload();
    }
    setDeleteTarget(null);
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(keyDialog.apiKey);
      toast.success('API key copied');
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  const columns: DataTableColumn<BiometricDevice>[] = [
    {
      id: 'label',
      header: 'Device',
      sortable: true,
      sortAccessor: (d) => d.label,
      cell: (d) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">{d.label}</div>
          {d.serial && <div className="text-xs text-muted-foreground">SN: {d.serial}</div>}
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (d) => (
        <span className="inline-flex items-center gap-1.5 text-sm capitalize">
          {d.type === 'face' ? (
            <ScanFace className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
          )}
          {d.type}
        </span>
      ),
    },
    {
      id: 'outlet',
      header: 'Branch',
      cell: (d) => (
        <span className="text-sm text-muted-foreground">
          {d.outlet_id ? outletName.get(d.outlet_id) ?? '—' : 'Unassigned'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (d) => {
        const online = isDeviceOnline(d.last_seen_at);
        return (
          <div className="space-y-0.5">
            <StatusBadge tone={online ? 'green' : 'grey'}>{online ? 'Online' : 'Offline'}</StatusBadge>
            <div className="text-[11px] text-muted-foreground">
              {d.last_seen_at
                ? `Seen ${formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true })}`
                : 'Never connected'}
            </div>
          </div>
        );
      },
    },
    {
      id: 'key',
      header: 'API key',
      cell: (d) =>
        d.api_key_prefix ? (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{d.api_key_prefix}…</code>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400">Not provisioned</span>
        ),
    },
  ];

  const rowActions = (d: BiometricDevice) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={`Regenerate key for ${d.label}`}
        disabled={busyId === d.id}
        onClick={() => setRegenTarget(d)}
      >
        {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={`Edit ${d.label}`}
        onClick={() => openEdit(d)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        aria-label={`Remove ${d.label}`}
        onClick={() => setDeleteTarget(d)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Fingerprint className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Devices
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Fingerprint &amp; face readers that punch attendance. Each device authenticates with its own
          API key and posts to{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/functions/v1/ingest-punches</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {error ? (
          <ErrorState
            title="Couldn't load devices"
            description="Reload to try again."
            onRetry={reload}
            className="py-8"
          />
        ) : (
          <DataTable
            columns={columns}
            data={devices}
            rowKey={(d) => d.id}
            isLoading={loading}
            rowActions={rowActions}
            actionsHeader="Actions"
            toolbar={
              <div className="flex items-center justify-end">
                <Button size="sm" className="gap-2" onClick={openAdd}>
                  <Plus className="h-4 w-4" />
                  Add device
                </Button>
              </div>
            }
            emptyState={
              <EmptyState
                icon={Fingerprint}
                title="No devices yet"
                description="Register a biometric or face device to start ingesting attendance punches."
                action={
                  <Button onClick={openAdd} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add device
                  </Button>
                }
              />
            }
          />
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit device' : 'Add device'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update this device’s details.'
                : 'Register a new reader. You’ll get its API key next.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="device-label">Label</Label>
              <Input
                id="device-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Front desk reader"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="device-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as DeviceType }))}
                >
                  <SelectTrigger id="device-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="fingerprint">Fingerprint</SelectItem>
                    <SelectItem value="face">Face</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device-serial">Serial (optional)</Label>
                <Input
                  id="device-serial"
                  value={form.serial}
                  onChange={(e) => setForm((f) => ({ ...f, serial: e.target.value }))}
                  placeholder="e.g. ZK-9981"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="device-outlet">Branch</Label>
              <Select
                value={form.outletId}
                onValueChange={(v) => setForm((f) => ({ ...f, outletId: v }))}
              >
                <SelectTrigger id="device-outlet">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={OUTLET_NONE}>Unassigned</SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-3">
                  <Label className="text-sm">Active</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Inactive devices are rejected at ingestion.
                  </p>
                </div>
                <Switch
                  aria-label="Device active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save' : 'Add device'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API key reveal dialog (shown once) */}
      <Dialog open={keyDialog.open} onOpenChange={(o) => setKeyDialog((k) => ({ ...k, open: o }))}>
        <DialogContent className="max-w-[90vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>API key for {keyDialog.label}</DialogTitle>
            <DialogDescription>
              Copy this now — it’s shown once and cannot be retrieved later. Configure the device with
              the key and endpoint below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Device API key (send as header <code>x-device-key</code>)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">
                  {keyDialog.apiKey}
                </code>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={copyKey} aria-label="Copy API key">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ingest endpoint</Label>
              <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">
                POST {INGEST_ENDPOINT}
              </code>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setKeyDialog((k) => ({ ...k, open: false }))}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate key confirm */}
      <AlertDialog open={!!regenTarget} onOpenChange={(o) => !o && setRegenTarget(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately invalidates {regenTarget?.label}’s current key. The device will reject
              punches until it’s reconfigured with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const d = regenTarget;
                setRegenTarget(null);
                if (d) generateKey(d.id, d.label);
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove device?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.label} will be removed. Existing attendance it produced is kept; future
              punches from it will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
