import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { History, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Pattern 6 — a table column header with a coloured underline that opens a
 * rules <Drawer> on click. This is how payroll rules get edited from the
 * number they produced, instead of from a distant settings page.
 */
export function ConfigurableHeader({
  label,
  onOpen,
  className,
}: {
  label: ReactNode;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'inline-flex items-center gap-1 border-b-2 border-primary/70 pb-0.5 text-xs font-medium',
        'text-foreground transition-colors hover:border-primary hover:text-primary',
        className,
      )}
      title="Click to edit the rules behind this column"
    >
      {label}
      <Settings2 className="h-3 w-3 opacity-60" />
    </button>
  );
}

interface HistoryRow {
  id: string;
  performed_at: string;
  performed_by: string | null;
  field: string;
  oldValue: string;
  newValue: string;
}

const fmtVal = (v: unknown): string => {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/**
 * Pattern 6b — the change history every rules drawer ends with:
 * Modified / By / Field / Old / New, read from audit_log for that settings
 * table (field-level diff of old_data vs new_data).
 */
export function ConfigHistory({
  table,
  /** Only show changes to these fields (defaults to every changed field). */
  fields,
  limit = 15,
}: {
  table: string;
  fields?: string[];
  limit?: number;
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('audit_log')
          .select('id, performed_at, performed_by, action, old_data, new_data')
          .eq('table_name', table)
          .order('performed_at', { ascending: false })
          .limit(50);
        if (error) throw error;

        type AuditRow = {
          id: string; performed_at: string; performed_by: string | null; action: string;
          old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
        };
        const out: HistoryRow[] = [];
        for (const r of (data ?? []) as unknown as AuditRow[]) {
          const oldD = r.old_data ?? {};
          const newD = r.new_data ?? {};
          const keys = new Set([...Object.keys(oldD), ...Object.keys(newD)]);
          for (const k of keys) {
            if (k === 'updated_at' || k === 'created_at' || k === 'updated_by' || k === 'id') continue;
            if (fields && !fields.includes(k)) continue;
            const before = fmtVal(oldD[k]);
            const after = fmtVal(newD[k]);
            if (before === after) continue;
            out.push({ id: `${r.id}:${k}`, performed_at: r.performed_at, performed_by: r.performed_by, field: k, oldValue: before, newValue: after });
            if (out.length >= limit) break;
          }
          if (out.length >= limit) break;
        }

        // Resolve performer names (best-effort).
        const byIds = [...new Set(out.map((o) => o.performed_by).filter(Boolean))] as string[];
        const names = new Map<string, string>();
        if (byIds.length) {
          const { data: staff } = await supabase.from('staff').select('user_id, full_name').in('user_id', byIds);
          for (const s of (staff ?? []) as { user_id: string | null; full_name: string }[]) {
            if (s.user_id) names.set(s.user_id, s.full_name);
          }
        }
        if (!cancelled) {
          setRows(out.map((o) => ({ ...o, performed_by: o.performed_by ? (names.get(o.performed_by) ?? 'User') : '—' })));
          setLoaded(true);
        }
      } catch {
        // audit.view is role-gated — a user without it simply sees no history.
        if (!cancelled) { setRows([]); setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [table, fields, limit]);

  return (
    <div className="mt-6 border-t pt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <History className="h-3.5 w-3.5" /> Change history
      </p>
      {!loaded ? null : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recorded changes.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="border-b bg-secondary/40 text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Modified</th>
                <th className="px-2 py-1.5 font-medium">By</th>
                <th className="px-2 py-1.5 font-medium">Field</th>
                <th className="px-2 py-1.5 font-medium">Old</th>
                <th className="px-2 py-1.5 font-medium">New</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-2 py-1">{format(new Date(r.performed_at), 'dd MMM yy, HH:mm')}</td>
                  <td className="whitespace-nowrap px-2 py-1">{r.performed_by}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono">{r.field}</td>
                  <td className="max-w-[10rem] truncate px-2 py-1 text-muted-foreground" title={r.oldValue}>{r.oldValue}</td>
                  <td className="max-w-[10rem] truncate px-2 py-1" title={r.newValue}>{r.newValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
