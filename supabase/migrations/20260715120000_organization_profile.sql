-- ============================================================================
-- Organization profile (single-tenant): the owner's company details + logo,
-- captured on first owner login and shown in the sidebar under the product logo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organization_profile (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton   boolean NOT NULL DEFAULT true,
  trade_name  text,
  legal_name  text,
  email       text,
  website     text,
  phone       text,
  gstin       text,
  pan         text,
  address     text,
  city        text,
  state       text,
  pincode     text,
  logo_url    text,
  onboarded_at timestamptz,          -- NULL until the owner completes onboarding
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_profile_singleton UNIQUE (singleton)
);

ALTER TABLE public.organization_profile ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read it (the sidebar shows the name + logo to everyone).
DROP POLICY IF EXISTS "Read organization profile" ON public.organization_profile;
CREATE POLICY "Read organization profile"
  ON public.organization_profile FOR SELECT TO authenticated USING (true);

-- Only the owner may create/update it.
DROP POLICY IF EXISTS "Owner manages organization profile" ON public.organization_profile;
CREATE POLICY "Owner manages organization profile"
  ON public.organization_profile FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

DROP TRIGGER IF EXISTS organization_profile_set_updated_at ON public.organization_profile;
CREATE TRIGGER organization_profile_set_updated_at
  BEFORE UPDATE ON public.organization_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the single row so onboarding is an UPDATE. onboarded_at stays NULL until
-- the owner submits the form — that NULL is the "show onboarding" signal.
INSERT INTO public.organization_profile (singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;

-- Public bucket for the org logo (logos aren't sensitive; a public URL renders
-- directly in the sidebar without signed-URL round-trips).
INSERT INTO storage.buckets (id, name, public) VALUES ('org-assets', 'org-assets', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read org-assets" ON storage.objects;
CREATE POLICY "Public read org-assets"
  ON storage.objects FOR SELECT USING (bucket_id = 'org-assets');

DROP POLICY IF EXISTS "Owner writes org-assets" ON storage.objects;
CREATE POLICY "Owner writes org-assets"
  ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'org-assets' AND public.has_role(auth.uid(), 'owner'))
  WITH CHECK (bucket_id = 'org-assets' AND public.has_role(auth.uid(), 'owner'));
