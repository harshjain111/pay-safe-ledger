// ============================================================================
// Masters (outlets / departments / designations) — one shared, deduplicated read.
//
// These three lists are tiny, change maybe once a month, and are needed by
// almost every screen: outlets alone was fetched from 20 different call sites,
// twice on the dashboard alone.
//
// That matters more than the row count suggests. These queries are trivial for
// Postgres — single-digit milliseconds — but a round trip to the database costs
// ~150 ms from here, so what a page really pays is round trips, not rows. A
// duplicate list is a wasted 150 ms whatever its size.
//
// Two layers:
//   * in-flight dedup — components mounting in the same tick share one request
//     rather than each firing their own;
//   * a short TTL — navigating away and back re-renders from memory instead of
//     re-querying.
//
// Anything that writes a master must call invalidateMasters() so the next read
// goes to the server (ManageOutletsDepartmentsCard does).
// ============================================================================

import { supabase } from '@/integrations/supabase/anyClient';

export interface MasterRow {
  id: string;
  name: string;
  is_active: boolean;
}

export type MasterTable = 'outlets' | 'departments' | 'designations';

/** How long a fetched list stays fresh. Masters change rarely; a stale name for
 *  up to this long is harmless, and any edit invalidates immediately. */
const TTL_MS = 5 * 60 * 1000;

interface Entry {
  rows: MasterRow[];
  at: number;
}

const cache = new Map<MasterTable, Entry>();
const inFlight = new Map<MasterTable, Promise<MasterRow[]>>();

/**
 * All rows of a master list (active and inactive), name-ordered.
 *
 * Callers that only want the active ones filter on `is_active` — one cached
 * list serves both, so an "active only" screen and an "all" screen don't cost
 * two round trips.
 */
export async function fetchMaster(table: MasterTable, force = false): Promise<MasterRow[]> {
  if (!force) {
    const hit = cache.get(table);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
    const pending = inFlight.get(table);
    if (pending) return pending;
  }

  const p = (async () => {
    const { data, error } = await supabase
      .from(table)
      .select('id, name, is_active')
      .order('name');
    if (error) throw error;
    const rows = (data ?? []) as MasterRow[];
    cache.set(table, { rows, at: Date.now() });
    return rows;
  })();

  inFlight.set(table, p);
  try {
    return await p;
  } finally {
    inFlight.delete(table);
  }
}

export const fetchOutlets = (force = false) => fetchMaster('outlets', force);
export const fetchDepartments = (force = false) => fetchMaster('departments', force);
export const fetchDesignations = (force = false) => fetchMaster('designations', force);

/** Active rows only — the common case for pickers. */
export async function fetchActiveMaster(table: MasterTable): Promise<MasterRow[]> {
  return (await fetchMaster(table)).filter((r) => r.is_active);
}

/** Drop cached lists after an edit. Omit `table` to clear all three. */
export function invalidateMasters(table?: MasterTable): void {
  if (table) cache.delete(table);
  else cache.clear();
}
