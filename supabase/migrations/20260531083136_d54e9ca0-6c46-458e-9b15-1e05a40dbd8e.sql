
-- Extend staff with HR fields (all optional)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- Allow admins to update these new non-financial profile fields too
-- (existing trigger restrict_admin_staff_updates only blocks the original sensitive set;
--  new columns are implicitly allowed.)

-- Documents
CREATE TYPE public.staff_document_type AS ENUM (
  'aadhaar','pan','bank_details','education','employment_contract','experience_certificate','other'
);

CREATE TABLE public.staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  doc_type public.staff_document_type NOT NULL DEFAULT 'other',
  doc_label TEXT,
  doc_number TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT,
  notes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_documents TO authenticated;
GRANT ALL ON public.staff_documents TO service_role;

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage staff documents"
  ON public.staff_documents FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Admins manage staff documents"
  ON public.staff_documents FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CA view staff documents"
  ON public.staff_documents FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ca'::app_role));

CREATE POLICY "Staff view own documents"
  ON public.staff_documents FOR SELECT TO authenticated
  USING (staff_id = get_user_staff_id(auth.uid()));

-- Employment history
CREATE TYPE public.employment_event_type AS ENUM (
  'promotion','transfer','salary_revision','role_change','other'
);

CREATE TABLE public.employment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  event_type public.employment_event_type NOT NULL,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  from_value TEXT,
  to_value TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_history TO authenticated;
GRANT ALL ON public.employment_history TO service_role;

ALTER TABLE public.employment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage employment history"
  ON public.employment_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Admins manage employment history"
  ON public.employment_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance roles view employment history"
  ON public.employment_history FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'ca'::app_role));

CREATE POLICY "Staff view own employment history"
  ON public.employment_history FOR SELECT TO authenticated
  USING (staff_id = get_user_staff_id(auth.uid()));

CREATE INDEX idx_employment_history_staff ON public.employment_history(staff_id, event_date DESC);
CREATE INDEX idx_staff_documents_staff ON public.staff_documents(staff_id);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('staff-photos','staff-photos', true),
  ('staff-documents','staff-documents', false)
ON CONFLICT (id) DO NOTHING;

-- staff-photos: public read, Owner/Admin write
CREATE POLICY "Staff photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'staff-photos');

CREATE POLICY "Owners admins upload staff photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-photos' AND (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role)));

CREATE POLICY "Owners admins update staff photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'staff-photos' AND (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role)));

CREATE POLICY "Owners admins delete staff photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'staff-photos' AND (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role)));

-- staff-documents: Owner/Admin full; staff read own (path prefix = staff_id)
CREATE POLICY "Owners admins manage staff documents storage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'staff-documents' AND (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role)))
  WITH CHECK (bucket_id = 'staff-documents' AND (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role)));

CREATE POLICY "Staff read own documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND (storage.foldername(name))[1] = get_user_staff_id(auth.uid())::text
  );

CREATE POLICY "CA read staff documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'staff-documents' AND has_role(auth.uid(),'ca'::app_role));
