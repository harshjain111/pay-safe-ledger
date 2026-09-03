-- ============================================================================
-- Hide the outlets that are really biometric devices, not places.
--
-- pull-etimetracklite bootstraps an outlet per DEVICE NAME
-- (supabase/functions/pull-etimetracklite/index.ts: outlets.upsert({ name })),
-- so the connector and the two ME units became selectable "outlets" and
-- cluttered every outlet picker in the app.
--
-- Deactivated, not deleted: each still owns a biometric_devices row, and
-- attendance_sessions carry the outlet_id stamped from that device. Ingestion
-- is unaffected — ingest-punches resolves the device by its key and copies
-- device.outlet_id verbatim; it never checks outlets.is_active. Pickers filter
-- on is_active, so these simply stop appearing.
--
-- Real outlets (Ballu, Mirosh, Reality, TD) and Mobile — used for app
-- self-check-in — are deliberately left active.
--
-- Note: a later eTimeTrackLite sync re-upserts these names, but its upsert
-- only sets `name`, so is_active stays false.
-- ============================================================================

UPDATE public.outlets
   SET is_active = false
 WHERE name IN ('eTimeTrackLite Connector', 'ME(Attendance)', 'ME(Canteen)')
   AND NOT EXISTS (
     -- Never hide an outlet that actually has staff assigned to it.
     SELECT 1 FROM public.staff s WHERE s.outlet_id = outlets.id
   );
