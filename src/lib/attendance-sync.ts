import { supabase } from '@/integrations/supabase/client';

const LAST_SYNC_KEY = 'hrbuddy_last_attendance_sync';
const MIN_INTERVAL_MS = 5 * 60_000; // auto-sync (login / mount) at most once per 5 min

export interface SyncResult {
  ok: boolean;
  reason?: string;
  upserted?: number;
  sessionsBuilt?: number;
  full?: boolean;
  rebuilt?: number | null;
  removed?: number | null;
}

/**
 * Pull the last few days of biometric punches on demand. Throttled for automatic
 * triggers (login / widget mount); pass { force: true } for an explicit refresh.
 * Never throws — a slow/unreachable device returns { ok: false, reason }.
 */
export async function syncAttendanceNow(opts?: { force?: boolean }): Promise<SyncResult> {
  const now = Date.now();
  if (!opts?.force) {
    const last = Number(localStorage.getItem(LAST_SYNC_KEY) || 0);
    if (now - last < MIN_INTERVAL_MS) return { ok: true, reason: 'recent' };
  }
  localStorage.setItem(LAST_SYNC_KEY, String(now));
  try {
    const { data, error } = await supabase.functions.invoke('sync-attendance', { body: {} });
    if (error) return { ok: false, reason: error.message };
    return (data as SyncResult) ?? { ok: false, reason: 'No response' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Sync failed' };
  }
}

/**
 * Hard resync — pulls a wide window (~5 weeks) then rebuilds every biometric day
 * cleanly. Slower (can take up to ~1–2 min). Never throws.
 */
export async function hardResyncAttendance(): Promise<SyncResult> {
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  try {
    const { data, error } = await supabase.functions.invoke('sync-attendance', { body: { full: true } });
    if (error) return { ok: false, reason: error.message };
    return (data as SyncResult) ?? { ok: false, reason: 'No response' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Resync failed' };
  }
}
