-- ============================================================================
-- The eTimeTrackLite connector's device identity.
--
-- The pull-etimetracklite connector authenticates to ingest-punches as ONE
-- device (outlet grouping is by staff.outlet_id, not by device). Only the
-- SHA-256 hash of its key lives here; the plaintext key is the ETIMETRACK_DEVICE_KEY
-- secret. Fixed id so re-applies update the key hash in place.
-- ============================================================================

INSERT INTO public.biometric_devices (id, label, type, api_key_hash, api_key_prefix, is_active, status)
VALUES (
  'e551e551-0000-0000-0000-000000000001',
  'eTimeTrackLite Connector',
  'fingerprint',
  '973cc7093f237021dcefbe7dbc659bab8feb6c88f22698ceadbe242bfaf53082',
  'etl_3d0fdd',
  true,
  'offline'
)
ON CONFLICT (id) DO UPDATE
  SET api_key_hash   = EXCLUDED.api_key_hash,
      api_key_prefix = EXCLUDED.api_key_prefix,
      is_active      = true;
