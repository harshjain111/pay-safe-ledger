import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Inbox, Paperclip, ShieldCheck, ShieldAlert, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader, DataTable, Drawer, EmptyState, InlineNote, type DataTableColumn } from '@/components/patterns';
import { StatusTabs } from '@/components/ui/status-tabs';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Concerns raised by staff.
//
// The submission side has always worked — anonymously, with attachments — but
// nothing in the app ever read the table, so every concern went into the
// database and was never seen. This is that missing half.
//
// ANONYMITY IS REAL AND MUST STAY REAL. A staff member who ticked "submit
// anonymously" has no submitted_by on their row; the edge function writes with
// a service role precisely so the record cannot be traced back. This screen
// therefore shows what the row holds and never joins to staff to guess — an
// inbox that quietly de-anonymises people is worse than no inbox, because the
// promise made at submission was explicit.
//
// Owner-only, matching the RLS on both the table and the attachment bucket.
// ---------------------------------------------------------------------------

type Status = 'open' | 'reviewing' | 'resolved' | 'dismissed';

interface Row {
  id: string;
  category: string;
  message: string | null;
  photo_path: string | null;
  voice_path: string | null;
  status: Status;
  reviewer_notes: string | null;
  resolved_at: string | null;
  created_on: string;
  submitted_by_name: string | null;
}

const STATUS_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export default function Grievances() {
  const { isOwner } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status | 'all'>('open');
  const [open, setOpen] = useState<Row | null>(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Status>('open');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<{ photo?: string; voice?: string }>({});

  const load = useCallback(async () => {
    if (!isOwner) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('grievances')
        .select('*')
        .order('created_on', { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load concerns');
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => { void load(); }, [load]);

  // Attachments live in a private bucket, so they are fetched as short-lived
  // signed links when a concern is opened rather than held on the list.
  useEffect(() => {
    let cancelled = false;
    if (!open) { setFiles({}); return; }
    (async () => {
      const next: { photo?: string; voice?: string } = {};
      for (const [key, path] of [['photo', open.photo_path], ['voice', open.voice_path]] as const) {
        if (!path) continue;
        const { data } = await supabase.storage.from('grievances').createSignedUrl(path, 300);
        if (data?.signedUrl) next[key] = data.signedUrl;
      }
      if (!cancelled) setFiles(next);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const visible = useMemo(
    () => rows.filter((r) => tab === 'all' || r.status === tab),
    [rows, tab],
  );
  const openCount = rows.filter((r) => r.status === 'open').length;

  const startReview = (r: Row) => {
    setOpen(r);
    setStatus(r.status);
    setNotes(r.reviewer_notes ?? '');
  };

  const save = async () => {
    if (!open) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('grievances')
        .update({
          status,
          reviewer_notes: notes.trim() || null,
          // Stamped only when it actually reaches an end state.
          resolved_at: status === 'resolved' || status === 'dismissed'
            ? (open.resolved_at ?? new Date().toISOString())
            : null,
        })
        .eq('id', open.id);
      if (error) throw error;
      toast.success('Concern updated');
      setOpen(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s: Status) =>
    s === 'resolved' ? <Badge>Resolved</Badge>
      : s === 'dismissed' ? <Badge variant="secondary">Dismissed</Badge>
        : s === 'reviewing' ? <Badge variant="outline">Reviewing</Badge>
          : <Badge variant="destructive">Open</Badge>;

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'from', header: 'From',
      render: (r) => (
        r.submitted_by_name ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            {r.submitted_by_name}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Anonymous
          </span>
        )
      ),
    },
    { key: 'category', header: 'Category', render: (r) => r.category },
    {
      key: 'message', header: 'Concern',
      render: (r) => (
        <span className="block max-w-[420px] truncate">
          {r.message || <span className="text-muted-foreground">No message</span>}
        </span>
      ),
    },
    {
      key: 'files', header: '', align: 'center',
      render: (r) => (r.photo_path || r.voice_path
        ? <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has attachment" />
        : null),
    },
    { key: 'raised', header: 'Raised', render: (r) => format(parseISO(r.created_on), 'dd MMM yyyy') },
    { key: 'status', header: 'Status', align: 'center', render: (r) => statusBadge(r.status) },
    {
      key: 'action', header: '', align: 'right',
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs whitespace-nowrap"
          onClick={() => startReview(r)}
        >
          Review
        </Button>
      ),
    },
  ];

  if (!isOwner) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Concerns" />
        <EmptyState
          icon={ShieldAlert}
          title="Owners only"
          instruction="Concerns are readable by owners alone, so that staff can raise them in confidence."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Concerns"
        description="What staff have raised through the app — read by owners only."
        count={loading ? undefined : visible.length}
        actions={
          openCount > 0 ? (
            <span className="rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
              {openCount} open
            </span>
          ) : undefined
        }
      />

      <InlineNote>
        A concern marked Anonymous carries no submitter — the app never recorded who
        sent it, so it cannot be traced back from here or anywhere else.
      </InlineNote>

      <StatusTabs value={tab} onValueChange={(v) => setTab(v as Status | 'all')} tabs={STATUS_TABS} />

      {loading ? null : visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === 'open' ? 'Nothing open' : 'Nothing to show'}
          instruction={
            tab === 'open'
              ? 'Concerns raised from the app arrive here.'
              : 'Use the tabs above to see other concerns.'
          }
        />
      ) : (
        <DataTable<Row> rows={visible} columns={columns} rowKey={(r) => r.id} />
      )}

      <Drawer
        open={!!open}
        onOpenChange={(o) => { if (!o) setOpen(null); }}
        title={open ? open.category : ''}
        description={open ? `Raised ${format(parseISO(open.created_on), 'dd MMMM yyyy')}` : undefined}
        footer={
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">From</p>
              <p className="mt-0.5 text-sm">
                {open.submitted_by_name ?? 'Anonymous — no submitter recorded'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">Concern</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {open.message || <span className="text-muted-foreground">No message given</span>}
              </p>
            </div>

            {(open.photo_path || open.voice_path) && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Attachments</p>
                {open.photo_path && (
                  files.photo
                    ? <img src={files.photo} alt="Attached by the sender" className="max-h-64 rounded-lg border" />
                    : <p className="text-xs text-muted-foreground">Loading image…</p>
                )}
                {open.voice_path && (
                  files.voice
                    ? <audio controls src={files.voice} className="w-full" />
                    : <p className="text-xs text-muted-foreground">Loading recording…</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was done about this…"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                For your own record. The sender does not see these.
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
