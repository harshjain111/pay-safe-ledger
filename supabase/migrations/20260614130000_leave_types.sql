-- ============================================================================
-- MULTIPLE LEAVE TYPES
--
--   leave_types     -> configurable leave types (paid?, accrual, quota, ...)
--   leave_balances  -> per-staff, per-type opening (carry-forward) balance
--   leave_records.leave_type_id -> the configured type a record belongs to
--
-- The previous single "paid leave quota" (leave_settings) is migrated into a
-- default 'Paid Leave' type so no balances are lost. Existing leave_records are
-- backfilled from their legacy `leave_type` enum, which is KEPT for back-compat
-- (settlement docking still reads `deduction_days`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leave_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  code              text NOT NULL,
  is_paid           boolean NOT NULL DEFAULT true,
  accrual           text NOT NULL DEFAULT 'annual',
  default_quota     numeric NOT NULL DEFAULT 0,
  -- Per-day salary deduction when this type is used (0 for paid, 1 for unpaid…).
  default_deduction numeric NOT NULL DEFAULT 0,
  carry_forward     boolean NOT NULL DEFAULT false,
  max_balance       numeric,
  -- The canonical paid-leave type the dashboards/balance cards read.
  is_default        boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_types_code_unique UNIQUE (code),
  CONSTRAINT leave_types_accrual_check CHECK (accrual IN ('annual', 'monthly', 'none'))
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view leave types"       ON public.leave_types;
DROP POLICY IF EXISTS "Owners and admins manage leave types" ON public.leave_types;

CREATE POLICY "Authenticated view leave types"
  ON public.leave_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners and admins manage leave types"
  ON public.leave_types FOR ALL TO authenticated
  USING      (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER leave_types_set_updated_at
  BEFORE UPDATE ON public.leave_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- per-staff, per-type opening (carry-forward) balance --------------------
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year          integer NOT NULL,
  -- Opening (carried-forward) days. Accrued / used / balance are computed live
  -- from leave_types + approved leave_records.
  opening       numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_balances_unique UNIQUE (staff_id, leave_type_id, year)
);

CREATE INDEX IF NOT EXISTS leave_balances_staff_idx ON public.leave_balances(staff_id);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own or privileged leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Owners and admins manage leave balances" ON public.leave_balances;

CREATE POLICY "View own or privileged leave balances"
  ON public.leave_balances FOR SELECT TO authenticated
  USING (
    staff_id = public.get_user_staff_id(auth.uid())
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "Owners and admins manage leave balances"
  ON public.leave_balances FOR ALL TO authenticated
  USING      (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER leave_balances_set_updated_at
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- reference the configured type from each leave record -------------------
ALTER TABLE public.leave_records
  ADD COLUMN IF NOT EXISTS leave_type_id uuid REFERENCES public.leave_types(id);

CREATE INDEX IF NOT EXISTS leave_records_leave_type_id_idx ON public.leave_records(leave_type_id);

-- ---- seed the built-in types (mirrors the legacy LEAVE_TYPE_CONFIG) ---------
INSERT INTO public.leave_types (name, code, is_paid, accrual, default_quota, default_deduction, is_default, sort_order)
VALUES
  ('Paid Leave',   'PL',  true,  'annual', 12, 0, true,  1),
  ('Unpaid Leave', 'UL',  false, 'none',   0,  1, false, 2),
  ('Penalty',      'PEN', false, 'none',   0,  2, false, 3)
ON CONFLICT (code) DO NOTHING;

-- Migrate the single paid-leave quota (if leave_settings exists) into Paid Leave.
DO $$
BEGIN
  IF to_regclass('public.leave_settings') IS NOT NULL THEN
    UPDATE public.leave_types t
       SET default_quota = COALESCE(s.annual_quota, t.default_quota),
           accrual       = COALESCE(s.accrual, t.accrual)
      FROM (SELECT annual_quota, accrual FROM public.leave_settings LIMIT 1) s
     WHERE t.code = 'PL';
  END IF;
END $$;

-- Backfill existing records from the legacy enum so no history is detached.
UPDATE public.leave_records r
   SET leave_type_id = t.id
  FROM public.leave_types t
 WHERE r.leave_type_id IS NULL
   AND (
        (r.leave_type = 'paid'    AND t.code = 'PL')
     OR (r.leave_type = 'unpaid'  AND t.code = 'UL')
     OR (r.leave_type = 'penalty' AND t.code = 'PEN')
   );
