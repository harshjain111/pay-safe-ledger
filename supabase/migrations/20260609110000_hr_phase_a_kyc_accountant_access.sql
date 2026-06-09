-- =============================================================================
-- HR Module — Phase A: let accountants attach & view KYC at staff enrollment
-- =============================================================================
-- Accountants can already create staff (via the create-staff-user edge function),
-- and KYC upload is now compulsory at enrollment. Previously only owner/admin could
-- write the KYC table/buckets, so an accountant enrolling staff would fail on
-- upload. Per requirement, accountants may UPLOAD and VIEW KYC. We grant them
-- SELECT + INSERT (not UPDATE/DELETE) on staff_documents and the KYC storage
-- buckets. Existing owner/admin (manage), CA (read), and staff (read-own) policies
-- are untouched.
-- =============================================================================

-- staff_documents table -------------------------------------------------------
CREATE POLICY "Accountants view staff documents"
  ON public.staff_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Accountants add staff documents"
  ON public.staff_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'accountant'::app_role));

-- staff-documents storage bucket (private) ------------------------------------
CREATE POLICY "Accountants read staff documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'staff-documents' AND public.has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Accountants upload staff documents storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-documents' AND public.has_role(auth.uid(), 'accountant'::app_role));

-- staff-photos storage bucket (read is already public; allow upload) -----------
CREATE POLICY "Accountants upload staff photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-photos' AND public.has_role(auth.uid(), 'accountant'::app_role));
