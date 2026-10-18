-- =======================================================
-- Mark all MM staff (EDL*) as face-enrolled on the device
-- + create the MILLI MILLI biometric device if not already there
-- Run in Supabase SQL Editor against lwjcunzlxwziokhfmyds
-- =======================================================

BEGIN;

-- 1. Ensure the MILLI MILLI biometric device row exists.
--    The device name here must match the label shown in eSSL DeviceLogList.
--    Using "MILLI MILLI" as the label — update if the device shows a different
--    name in the eSSL system (e.g. "MM-FaceDevice").
INSERT INTO public.biometric_devices (
  label, type, is_active, status, organization_id, outlet_id
)
SELECT
  'MILLI MILLI',
  'face',
  true,
  'online',
  public.default_organization_id(),
  (SELECT id FROM public.outlets
     WHERE organization_id = public.default_organization_id()
       AND name = 'MILLI MILLI'
     LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.biometric_devices WHERE label = 'MILLI MILLI'
);

-- 2. Mark every EDL* staff member as face-enrolled on this device.
--    On conflict (staff already has a row for this device): upgrade to face
--    if it was fingerprint, set status=enrolled.
INSERT INTO public.biometric_enrolments (staff_id, device_id, kind, status, enrolled_at, organization_id)
SELECT
  s.id,
  (SELECT id FROM public.biometric_devices WHERE label = 'MILLI MILLI' LIMIT 1),
  'face',
  'enrolled',
  now(),
  public.default_organization_id()
FROM public.staff s
WHERE s.employee_id LIKE 'EDL%'
  AND s.organization_id = public.default_organization_id()
ON CONFLICT (staff_id, device_id) DO UPDATE
  SET kind        = 'face',
      status      = 'enrolled',
      enrolled_at = COALESCE(biometric_enrolments.enrolled_at, now()),
      updated_at  = now();

COMMIT;

-- =======================================================
-- VERIFICATION QUERIES — run these to check the match
-- =======================================================

-- A. Enrollment summary: how many MM staff have face enrollment
SELECT
  COUNT(*)                                              AS total_mm_staff,
  COUNT(be.id)                                          AS face_enrolled,
  COUNT(*) - COUNT(be.id)                               AS missing_enrollment
FROM public.staff s
LEFT JOIN public.biometric_enrolments be
  ON be.staff_id = s.id
  AND be.kind = 'face'
  AND be.status = 'enrolled'
WHERE s.employee_id LIKE 'EDL%'
  AND s.organization_id = public.default_organization_id();

-- B. MM staff NOT yet face-enrolled (run after the INSERT above — should be 0)
SELECT s.employee_id, s.full_name, s.department, s.designation
FROM public.staff s
WHERE s.employee_id LIKE 'EDL%'
  AND s.organization_id = public.default_organization_id()
  AND NOT EXISTS (
    SELECT 1 FROM public.biometric_enrolments be
    WHERE be.staff_id = s.id AND be.kind = 'face' AND be.status = 'enrolled'
  )
ORDER BY s.employee_id;

-- C. Device punch activity: device user codes that DON'T match any staff record
--    (means someone is enrolled on device but their code wasn't imported to DB)
--    Run this AFTER the first day of punches from MM staff.
SELECT DISTINCT pe.raw_ref
FROM public.punch_events pe
WHERE pe.staff_id IS NULL
  AND pe.raw_ref LIKE 'etl:%'
LIMIT 50;
