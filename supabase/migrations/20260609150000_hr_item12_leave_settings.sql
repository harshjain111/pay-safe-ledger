-- =============================================================================
-- HR Module — Item 12: leave entitlement settings (for pending-leave balances)
-- =============================================================================
-- A single, admin-configurable paid-leave entitlement: either a fixed ANNUAL
-- quota or a MONTHLY accrual. Pending leaves = entitled (+ comp-off, item 13)
-- minus approved leaves taken. Stored as a singleton row.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.leave_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annual_quota numeric NOT NULL DEFAULT 12,
  accrual      text NOT NULL DEFAULT 'annual' CHECK (accrual IN ('annual', 'monthly')),
  singleton    boolean NOT NULL DEFAULT true,
  updated_by   uuid REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_settings_singleton UNIQUE (singleton)
);

ALTER TABLE public.leave_settings ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read the entitlement (staff see their own balance);
-- only owners/admins can change it.
CREATE POLICY "Authenticated view leave settings"
  ON public.leave_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners and admins manage leave settings"
  ON public.leave_settings FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.leave_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TRIGGER trg_leave_settings_updated_at
  BEFORE UPDATE ON public.leave_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
