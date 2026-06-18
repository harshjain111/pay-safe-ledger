-- ============================================================================
-- LEAVE ENCASHMENT — the "payable record / hook for payroll"
-- ============================================================================
-- When a leave type has encashment_enabled and a staff member's balance exceeds
-- encashment_limit at a period boundary, the carry-forward/encashment job emits
-- one row here (the units to pay) INSTEAD of forfeiting the excess. Payroll
-- converts units -> money at the staff member's daily rate at settlement time;
-- the hook reads status = 'pending'. UNIQUE(staff, type, period) keeps the job
-- idempotent (re-running a period never double-pays).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leave_encashment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  units         numeric(6,2) NOT NULL,
  period        text NOT NULL,                 -- 'YYYY-MM' (MONTH) or 'YYYY' (YEAR)
  period_end    date NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'cancelled')),
  settlement_id uuid REFERENCES public.salary_settlements(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_encashment_unique UNIQUE (staff_id, leave_type_id, period)
);
CREATE INDEX IF NOT EXISTS leave_encashment_staff_idx ON public.leave_encashment(staff_id, status);

ALTER TABLE public.leave_encashment ENABLE ROW LEVEL SECURITY;

-- Reviewers + the staff member read their encashment payables.
CREATE POLICY "Reviewers and own staff read leave encashment"
  ON public.leave_encashment FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR staff_id = public.get_user_staff_id(auth.uid())
  );

-- Owners/admins (and the service-role cron) manage encashment records.
CREATE POLICY "Owners and admins manage leave encashment"
  ON public.leave_encashment FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
