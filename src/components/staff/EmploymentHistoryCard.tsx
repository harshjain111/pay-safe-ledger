import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { History, Plus, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { EmploymentHistoryEntry, EmploymentEventType } from '@/types/database';

const EVENT_TYPES: { value: EmploymentEventType; label: string }[] = [
  { value: 'promotion', label: 'Promotion' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'salary_revision', label: 'Salary Revision' },
  { value: 'role_change', label: 'Role Change' },
  { value: 'other', label: 'Other' },
];

interface Props { staffId: string; canViewSalaries?: boolean }

export function EmploymentHistoryCard({ staffId, canViewSalaries }: Props) {
  const { user, isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const [entries, setEntries] = useState<EmploymentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmploymentHistoryEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [eventType, setEventType] = useState<EmploymentEventType>('promotion');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [notes, setNotes] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('employment_history')
      .select('*')
      .eq('staff_id', staffId)
      .order('event_date', { ascending: false });
    setEntries((data || []) as EmploymentHistoryEntry[]);
    setLoading(false);
  }, [staffId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleAdd = async () => {
    try {
      setAdding(true);
      const { error } = await supabase.from('employment_history').insert({
        staff_id: staffId,
        event_type: eventType,
        event_date: eventDate,
        from_value: fromValue.trim() || null,
        to_value: toValue.trim() || null,
        notes: notes.trim() || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast({ title: 'Entry added' });
      setShowForm(false);
      setFromValue(''); setToValue(''); setNotes('');
      fetchEntries();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setAdding(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('employment_history').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Entry deleted' });
      setDeleteTarget(null);
      fetchEntries();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const maskIfSalary = (entry: EmploymentHistoryEntry, val?: string | null) => {
    if (entry.event_type === 'salary_revision' && !canViewSalaries) return '***';
    return val || '—';
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" /> Employment History
          </CardTitle>
          <CardDescription>Promotions, transfers, role changes, salary revisions.</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)} className="gap-1">
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && canManage && (
          <div className="space-y-3 p-4 rounded-lg border border-dashed bg-muted/30">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Event Type</Label>
                <Select value={eventType} onValueChange={(v) => setEventType(v as EmploymentEventType)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>From</Label>
                <Input value={fromValue} onChange={(e) => setFromValue(e.target.value)} placeholder="Previous value" />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input value={toValue} onChange={(e) => setToValue(e.target.value)} placeholder="New value" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleAdd} disabled={adding} size="sm">
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Entry
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No history recorded.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {EVENT_TYPES.find(t => t.value === e.event_type)?.label ?? e.event_type}
                    </span>
                    <span className="text-xs text-muted-foreground">{format(new Date(e.event_date), 'PP')}</span>
                  </div>
                  <p className="text-sm mt-1">
                    <span className="text-muted-foreground">{maskIfSalary(e, e.from_value)}</span>
                    <span className="mx-2">→</span>
                    <span className="font-medium">{maskIfSalary(e, e.to_value)}</span>
                  </p>
                  {e.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
                </div>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(e)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete history entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{' '}
              <span className="font-medium text-foreground">
                {deleteTarget ? (EVENT_TYPES.find((t) => t.value === deleteTarget.event_type)?.label ?? deleteTarget.event_type) : ''}
              </span>
              {deleteTarget ? ` entry from ${format(new Date(deleteTarget.event_date), 'PP')}` : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => { ev.preventDefault(); confirmDelete(); }}
              disabled={isDeleting}
              className={buttonVariants({ variant: 'destructive' })}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
