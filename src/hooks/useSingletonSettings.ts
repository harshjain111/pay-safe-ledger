import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Loads a single-row ("singleton") settings table and exposes a save helper.
 *
 * Encapsulates the load → error → retry contract used by every settings panel:
 *  - `error` is true if the initial load failed (the panel must then block Save
 *    and offer a reload, never let the user write defaults into a missing table).
 *  - `reload()` re-runs the load (the retry affordance).
 *  - `save(patch)` updates the singleton row; throws on failure.
 */
export function useSingletonSettings<T>(
  table: string,
  columns: string,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await supabase
        .from(table as never)
        .select(columns)
        .maybeSingle();
      if (res.error) {
        setError(true);
        setData(null);
      } else {
        setData((res.data as T) ?? null);
      }
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [table, columns, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      const { error: saveError } = await supabase
        .from(table as never)
        .update(patch as never)
        .eq('singleton', true);
      if (saveError) throw saveError;
    },
    [table],
  );

  return { data, loading, error, reload: load, save };
}
