import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type DeviceType = 'fingerprint' | 'face';

export interface BiometricDevice {
  id: string;
  label: string;
  outlet_id: string | null;
  type: DeviceType;
  serial: string | null;
  status: string;
  last_seen_at: string | null;
  api_key_prefix: string | null;
  is_active: boolean;
}

/** A device counts as online if it checked in within the last 5 minutes. We
 *  derive this from last_seen_at rather than trusting the stored status flag, so
 *  a device that silently dropped off reads as offline. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isDeviceOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

// Note: api_key_hash is intentionally NOT selected — the UI never needs it.
const DEVICE_COLUMNS =
  'id, label, outlet_id, type, serial, status, last_seen_at, api_key_prefix, is_active';

export function useBiometricDevices(enabled = true) {
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('biometric_devices')
      .select(DEVICE_COLUMNS)
      .order('label');
    if (error) {
      setError(error.message);
      setDevices([]);
    } else {
      setDevices((data as BiometricDevice[]) ?? []);
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { devices, loading, error, reload };
}
