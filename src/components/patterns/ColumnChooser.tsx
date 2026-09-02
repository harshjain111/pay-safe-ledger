import { useCallback, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer } from './Drawer';

export interface ChooserColumn {
  key: string;
  label: string;
}

const storageKey = (pageId: string) => `columns:${pageId}`;

/**
 * Per-user column preference for a page (localStorage). Returns the visible
 * keys (defaulting to `defaultKeys`) and a setter that persists.
 */
export function useColumnPrefs(pageId: string, defaultKeys: string[]) {
  const [keys, setKeys] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey(pageId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) return parsed;
      }
    } catch { /* storage unavailable */ }
    return defaultKeys;
  });
  const save = useCallback((next: string[]) => {
    setKeys(next);
    try { localStorage.setItem(storageKey(pageId), JSON.stringify(next)); } catch { /* storage unavailable */ }
  }, [pageId]);
  const reset = useCallback(() => {
    setKeys(defaultKeys);
    try { localStorage.removeItem(storageKey(pageId)); } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultKeys treated as stable per page
  }, [pageId]);
  return { visibleKeys: keys, save, reset };
}

/**
 * Pattern 10 — Attendo's "Edit Columns": a drawer of checkboxes for every
 * available column, with "Reset To Default" and "Save". The choice persists
 * per user per page (localStorage).
 */
export function ColumnChooser({
  pageId,
  columns,
  visibleKeys,
  onSave,
  onReset,
}: {
  pageId: string;
  columns: ChooserColumn[];
  visibleKeys: string[];
  onSave: (keys: string[]) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set(visibleKeys));

  const openChooser = () => { setDraft(new Set(visibleKeys)); setOpen(true); };
  const toggle = (key: string) => setDraft((p) => {
    const n = new Set(p);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={openChooser}>
        <Columns3 className="h-4 w-4" /> Edit Columns
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Edit Columns"
        size="sm"
        description={`Choose the columns shown on this page (${pageId}).`}
        footer={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { onReset(); setOpen(false); }}>Reset To Default</Button>
            <Button
              className="ml-auto"
              disabled={draft.size === 0}
              onClick={() => { onSave(columns.map((c) => c.key).filter((k) => draft.has(k))); setOpen(false); }}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-1">
          {columns.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
              <Checkbox checked={draft.has(c.key)} onCheckedChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      </Drawer>
    </>
  );
}
