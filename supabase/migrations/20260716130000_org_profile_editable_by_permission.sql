-- ============================================================================
-- Let the owner delegate organisation-settings editing.
--
-- Previously the organization_profile row and the org-assets (logo) bucket were
-- writable by the OWNER only. Broaden both to the existing
-- 'settings.organisation.edit' permission. has_permission() short-circuits to
-- true for owners (permissions_system.sql:116), so the owner never loses access,
-- and the owner can now grant "Edit organisation settings" to specific users
-- (e.g. an admin) via Rights Templates.
-- ============================================================================

DROP POLICY IF EXISTS "Owner manages organization profile" ON public.organization_profile;
DROP POLICY IF EXISTS "Manage organization profile" ON public.organization_profile;
CREATE POLICY "Manage organization profile"
  ON public.organization_profile FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'settings.organisation.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.organisation.edit'));

DROP POLICY IF EXISTS "Owner writes org-assets" ON storage.objects;
DROP POLICY IF EXISTS "Manage org-assets" ON storage.objects;
CREATE POLICY "Manage org-assets"
  ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'org-assets' AND public.has_permission(auth.uid(), 'settings.organisation.edit'))
  WITH CHECK (bucket_id = 'org-assets' AND public.has_permission(auth.uid(), 'settings.organisation.edit'));
