import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/anyClient';
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
import { Textarea } from '@/components/ui/textarea';
import { Drawer, ConfigHistory, InlineNote } from '@/components/patterns';
import { toast } from '@/lib/toast';

export type RuleFieldType = 'number' | 'boolean' | 'select' | 'json';

export interface RuleField {
  key: string;
  label: string;
  type: RuleFieldType;
  options?: { value: string; label: string }[];
  help?: string;
  step?: string;
}

/**
 * PHASE 3 — the rules drawer behind a <ConfigurableHeader>. Edits the ONE
 * existing settings row of a rules table (hr_pay_rules / discipline_rules /
 * payroll_statutory_settings), ends with the audit-log change history, and
 * recomputes the grid on save. Users without the gating permission see the
 * values read-only rather than losing the drawer.
 */
export function RulesDrawer({
  open,
  onOpenChange,
  title,
  table,
  fields,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  table: string;
  fields: RuleField[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [rowId, setRowId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1).maybeSingle();
        if (error) throw error;
        if (!cancelled) {
          const row = (data ?? {}) as Record<string, unknown>;
          setRowId((row.id as string) ?? null);
          const v: Record<string, unknown> = {};
          for (const f of fields) v[f.key] = row[f.key];
          setValues(v);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not load the rules');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, table, fields]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        let v = values[f.key];
        if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
        if (f.type === 'json' && typeof v === 'string') {
          try { v = JSON.parse(v); } catch { throw new Error(`${f.label}: invalid JSON`); }
        }
        payload[f.key] = v;
      }
      if (rowId) {
        const { error } = await supabase.from(table).update(payload).eq('id', rowId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
      toast.success('Rules saved — the grid will recompute.');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the rules');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: RuleField) => {
    const v = values[f.key];
    switch (f.type) {
      case 'boolean':
        return (
          <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div>
              <Label className="text-sm">{f.label}</Label>
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
            <Switch checked={!!v} disabled={!canEdit} onCheckedChange={(c) => setValues((p) => ({ ...p, [f.key]: c }))} />
          </div>
        );
      case 'select':
        return (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-sm">{f.label}</Label>
            <Select value={v == null ? '' : String(v)} disabled={!canEdit} onValueChange={(nv) => setValues((p) => ({ ...p, [f.key]: nv }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
          </div>
        );
      case 'json':
        return (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-sm">{f.label}</Label>
            <Textarea
              rows={4}
              className="font-mono text-xs"
              disabled={!canEdit}
              value={typeof v === 'string' ? v : JSON.stringify(v ?? [], null, 0)}
              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
            />
            {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
          </div>
        );
      default:
        return (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-sm">{f.label}</Label>
            <Input
              type="number"
              step={f.step ?? 'any'}
              disabled={!canEdit}
              value={v == null ? '' : String(v)}
              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
            />
            {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
          </div>
        );
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="md"
      description="These rules drive the numbers in the column you clicked. Saving recomputes the grid."
      footer={
        canEdit ? (
          <Button className="w-full" onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save rules'}
          </Button>
        ) : (
          <InlineNote>You can view these rules but not change them — ask an owner for the permission.</InlineNote>
        )
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">{fields.map(renderField)}</div>
      )}
      <ConfigHistory table={table} fields={fields.map((f) => f.key)} />
    </Drawer>
  );
}
