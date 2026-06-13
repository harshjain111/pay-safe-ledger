import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { toast } from '@/lib/toast';

/**
 * Per-panel save coordination.
 *
 * Form cards inside a panel call `useSettingsForm(id, dirty, save)`. The panel
 * renders ONE sticky "Save changes" button that appears only when some form is
 * dirty, and on click runs every dirty form's save() — so each category panel
 * has exactly one Save that persists only that panel's fields.
 */
interface PanelCtx {
  register: (id: string, save: () => Promise<void>) => void;
  unregister: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
}

const Ctx = React.createContext<PanelCtx | null>(null);

/** Used by a form card to join its panel's single Save button. */
export function useSettingsForm(id: string, dirty: boolean, save: () => Promise<void>) {
  const ctx = React.useContext(Ctx);

  // Keep the latest save in a ref so we register once (stable) but always call
  // the freshest closure.
  const saveRef = React.useRef(save);
  saveRef.current = save;

  React.useEffect(() => {
    if (!ctx) return;
    ctx.register(id, () => saveRef.current());
    return () => ctx.unregister(id);
  }, [ctx, id]);

  React.useEffect(() => {
    ctx?.setDirty(id, dirty);
  }, [ctx, id, dirty]);
}

interface SettingsPanelProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** When false, the panel is read-only — Save never appears. */
  canEdit?: boolean;
}

export function SettingsPanel({ title, description, children, canEdit = true }: SettingsPanelProps) {
  const [forms, setForms] = React.useState<Record<string, { save: () => Promise<void>; dirty: boolean }>>({});
  const [saving, setSaving] = React.useState(false);

  const register = React.useCallback((id: string, save: () => Promise<void>) => {
    setForms((f) => ({ ...f, [id]: { save, dirty: f[id]?.dirty ?? false } }));
  }, []);
  const unregister = React.useCallback((id: string) => {
    setForms((f) => {
      const next = { ...f };
      delete next[id];
      return next;
    });
  }, []);
  const setDirty = React.useCallback((id: string, dirty: boolean) => {
    setForms((f) => (f[id] && f[id].dirty !== dirty ? { ...f, [id]: { ...f[id], dirty } } : f));
  }, []);

  const ctx = React.useMemo(() => ({ register, unregister, setDirty }), [register, unregister, setDirty]);

  const anyDirty = canEdit && Object.values(forms).some((x) => x.dirty);

  const saveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(Object.values(forms).filter((x) => x.dirty).map((x) => x.save()));
      toast.success('Changes saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex h-full flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>

        <div className={`flex-1 space-y-4 sm:space-y-6 ${anyDirty ? 'pb-20' : ''}`}>{children}</div>

        {anyDirty && (
          <div className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-end gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <span className="mr-auto text-xs text-muted-foreground">You have unsaved changes</span>
            <Button onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
