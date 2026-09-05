import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, Search, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, DataTable, EmptyState, InlineNote, type DataTableColumn } from '@/components/patterns';
import { StatusTabs } from '@/components/ui/status-tabs';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Phone Numbers — fill in the numbers staff sign in with.
//
// Staff sign in with their phone number, but almost every existing record
// predates that and has none: 212 of 214 active staff when this was written.
// Collecting those one at a time through the full staff form — which also
// demands KYC uploads before it will save — is not a realistic afternoon, so
// this is the one screen that does nothing but that: who is missing a number,
// type it, save.
//
// The number must be unique (staff_phone_digits_unique): resolve_login_email()
// finds an account by phone, so two people sharing one would make the login
// ambiguous. Clashes are checked here against the loaded list first, and a
// clash the database still rejects is reported against the row that caused it
// rather than as one failed save.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  full_name: string;
  employee_id: string;
  department: string | null;
  phone: string | null;
}

const digitsOf = (v: string) => v.replace(/\D/g, '');

export default function StaffPhones() {
  const { isOwner, can } = useAuth();
  const canEdit = isOwner || can('staff.edit');

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'missing' | 'all'>('missing');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, full_name, employee_id, department, phone')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      setRows((data ?? []) as Row[]);
      setDraft({});
      setErrors({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const missingCount = rows.filter((r) => !r.phone || !r.phone.trim()).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (tab === 'missing' ? !r.phone || !r.phone.trim() : true))
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.employee_id.toLowerCase().includes(q));
  }, [rows, tab, search]);

  // Only rows the user typed into, and only where the number actually changed.
  const pending = useMemo(
    () => Object.entries(draft)
      .map(([id, value]) => ({ id, digits: digitsOf(value) }))
      .filter(({ id, digits }) => {
        const row = rows.find((r) => r.id === id);
        return digits.length > 0 && digits !== digitsOf(row?.phone ?? '');
      }),
    [draft, rows],
  );

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    // Numbers already held by other staff, so a clash is caught before the
    // round trip rather than as a database error.
    const seen = new Map<string, string>();
    for (const r of rows) {
      const d = digitsOf(r.phone ?? '');
      if (d) seen.set(d, r.id);
    }
    for (const { id, digits } of pending) {
      if (digits.length < 10) {
        next[id] = 'Needs at least 10 digits';
        continue;
      }
      const owner = seen.get(digits);
      if (owner && owner !== id) {
        const who = rows.find((r) => r.id === owner);
        next[id] = 'Already used by ' + (who?.full_name ?? 'another employee');
        continue;
      }
      seen.set(digits, id);
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!pending.length) return;
    if (!validate()) {
      toast.error('Fix the highlighted numbers first');
      return;
    }
    setSaving(true);
    try {
      // One update per row: a single failure — a number claimed elsewhere since
      // this page loaded — should not throw away the rest of the typing.
      const failed: string[] = [];
      for (const { id, digits } of pending) {
        const { error } = await supabase.from('staff').update({ phone: digits }).eq('id', id);
        if (error) {
          const who = rows.find((r) => r.id === id);
          failed.push(who?.full_name ?? id);
          setErrors((prev) => ({
            ...prev,
            [id]: error.message.includes('staff_phone_digits_unique')
              ? 'This number is already used by another employee'
              : error.message,
          }));
        }
      }
      const saved = pending.length - failed.length;
      if (saved > 0) toast.success(saved + ' phone number' + (saved === 1 ? '' : 's') + ' saved');
      if (failed.length) toast.error('Could not save ' + failed.length + ': ' + failed.join(', '));
      await load();
    } finally {
      setSaving(false);
    }
  };

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'staff', header: 'Employee',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.full_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {r.employee_id}{r.department ? ' · ' + r.department : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'phone', header: 'Phone number (used to sign in)',
      render: (r) => (
        <div className="space-y-1">
          <Input
            value={draft[r.id] ?? r.phone ?? ''}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, [r.id]: e.target.value }));
              setErrors((prev) => ({ ...prev, [r.id]: '' }));
            }}
            disabled={!canEdit || saving}
            inputMode="numeric"
            placeholder="10-digit number"
            className={'h-7 max-w-[200px] text-sm ' + (errors[r.id] ? 'border-destructive' : '')}
          />
          {errors[r.id] && <p className="text-xs text-destructive">{errors[r.id]}</p>}
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', align: 'center',
      render: (r) => (r.phone && r.phone.trim()
        ? <Badge variant="outline">Can sign in</Badge>
        : <Badge variant="secondary">Code only</Badge>),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Phone Numbers"
        description="Staff sign in with their phone number — fill in anyone still missing one."
        count={loading ? undefined : visible.length}
        actions={
          canEdit ? (
            <Button onClick={save} disabled={saving || pending.length === 0}>
              {saving ? 'Saving…' : pending.length ? 'Save ' + pending.length : 'Save'}
            </Button>
          ) : undefined
        }
      />

      {!canEdit && (
        <InlineNote>
          You can see who is missing a number but not change it — that needs the
          &quot;Edit staff&quot; right.
        </InlineNote>
      )}

      {missingCount > 0 && (
        <InlineNote>
          {missingCount} active {missingCount === 1 ? 'employee has' : 'employees have'} no phone
          number. They can still sign in with their employee code, but not with a phone.
        </InlineNote>
      )}

      <StatusTabs
        value={tab}
        onValueChange={(v) => setTab(v as 'missing' | 'all')}
        tabs={[
          { value: 'missing', label: 'Missing (' + missingCount + ')' },
          { value: 'all', label: 'All active (' + rows.length + ')' },
        ]}
      />

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or code"
          className="pl-8"
        />
      </div>

      {loading ? null : visible.length === 0 ? (
        <EmptyState
          icon={tab === 'missing' ? Phone : ShieldAlert}
          title={tab === 'missing' ? 'Everyone has a phone number' : 'No matching staff'}
          instruction={
            tab === 'missing'
              ? 'Every active employee can sign in with their phone.'
              : 'Clear the search box to see the full list.'
          }
        />
      ) : (
        <DataTable<Row> rows={visible} columns={columns} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
