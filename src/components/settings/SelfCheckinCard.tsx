import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supabase as anyClient } from '@/integrations/supabase/anyClient';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationProfile, ORG_PROFILE_QUERY_KEY } from '@/hooks/useOrganizationProfile';

interface Row {
  id: string;
  full_name: string;
  designation: string | null;
  department: string | null;
  self_checkin_allowed: boolean;
}

/**
 * Settings → Attendance: control the in-app "Ready for your shift?" self
 * check-in/out. A master switch turns it on/off for the whole org; when on, an
 * admin can restrict it to specific people (everyone else relies on the
 * biometric device). Gated with the surrounding Attendance settings category.
 */
export function SelfCheckinCard() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const queryClient = useQueryClient();
  const { data: org } = useOrganizationProfile();

  const enabled = (org as { self_checkin_enabled?: boolean } | null)?.self_checkin_enabled !== false;
  const orgId = (org as { id?: string } | null)?.id;

  const [savingMaster, setSavingMaster] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    load();
  }, [canManage]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, designation, department, self_checkin_allowed' as never)
      .eq('is_active', true)
      .order('full_name');
    if (error) toast.error('Failed to load staff');
    else setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  };

  const setMaster = async (value: boolean) => {
    if (!orgId) return;
    setSavingMaster(true);
    const { error } = await anyClient
      .from('organization_profile')
      .update({ self_checkin_enabled: value })
      .eq('id', orgId);
    setSavingMaster(false);
    if (error) { toast.error('Could not update setting'); return; }
    queryClient.invalidateQueries({ queryKey: ORG_PROFILE_QUERY_KEY });
    toast.success(value ? 'Self check-in enabled' : 'Self check-in turned off');
  };

  const toggle = async (id: string, value: boolean) => {
    const prev = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, self_checkin_allowed: value } : r)));
    const { error } = await supabase
      .from('staff')
      .update({ self_checkin_allowed: value } as never)
      .eq('id', id);
    if (error) { toast.error('Update failed'); setRows(prev); }
  };

  const setAll = async (value: boolean) => {
    if (rows.length === 0) return;
    const prev = rows;
    setBulkSaving(true);
    setRows(rows.map((r) => ({ ...r, self_checkin_allowed: value })));
    const { error } = await supabase
      .from('staff')
      .update({ self_checkin_allowed: value } as never)
      .eq('is_active', true);
    setBulkSaving(false);
    if (error) { toast.error('Bulk update failed'); setRows(prev); }
    else toast.success(value ? 'Allowed for everyone' : 'Disallowed for everyone');
  };

  if (!canManage) return null;

  const filtered = rows.filter((r) => r.full_name.toLowerCase().includes(search.toLowerCase()));
  const allowedCount = rows.filter((r) => r.self_checkin_allowed).length;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <LogIn className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Self Check-in
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Let staff mark their own attendance from the app ("Ready for your shift?" — selfie +
          location). Turn this off to rely only on the biometric device, or keep it on and choose
          exactly who is allowed below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Master toggle */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Enable self check-in</p>
            <p className="text-xs text-muted-foreground">Master switch for the whole organisation.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savingMaster && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch aria-label="Enable self check-in" checked={enabled} disabled={savingMaster || !orgId} onCheckedChange={setMaster} />
          </div>
        </div>

        {/* Per-staff allow list (only relevant when enabled) */}
        {enabled && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Who can self check-in <span className="font-normal text-muted-foreground">({allowedCount}/{rows.length})</span></p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={bulkSaving || loading} onClick={() => setAll(true)}>Allow all</Button>
                <Button variant="outline" size="sm" disabled={bulkSaving || loading} onClick={() => setAll(false)}>Allow none</Button>
              </div>
            </div>
            <Input placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="rounded-lg border divide-y max-h-[420px] overflow-auto">
                {filtered.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{[r.designation, r.department].filter(Boolean).join(' • ') || '—'}</p>
                    </div>
                    <Switch
                      aria-label={`Allow self check-in for ${r.full_name}`}
                      checked={r.self_checkin_allowed}
                      onCheckedChange={(v) => toggle(r.id, v)}
                    />
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No staff found.</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
