
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS attendance_tracked boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  check_in_time time NOT NULL,
  check_out_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL UNIQUE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  override_check_in time,
  override_check_out time,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage shifts" ON public.shifts FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Admins manage shifts" ON public.shifts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Finance roles view shifts" ON public.shifts FOR SELECT
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'ca'::app_role)
  );
CREATE POLICY "Staff view own shift via assignment" ON public.shifts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_shift_assignments a
      WHERE a.shift_id = shifts.id
        AND a.staff_id = get_user_staff_id(auth.uid())
    )
  );

CREATE POLICY "Owners manage assignments" ON public.staff_shift_assignments FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Admins manage assignments" ON public.staff_shift_assignments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Finance roles view assignments" ON public.staff_shift_assignments FOR SELECT
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'ca'::app_role)
  );
CREATE POLICY "Staff view own assignment" ON public.staff_shift_assignments FOR SELECT
  USING (staff_id = get_user_staff_id(auth.uid()));

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_assign_updated_at
  BEFORE UPDATE ON public.staff_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.discipline_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grace_minutes_in integer NOT NULL DEFAULT 15,
  late_in_slabs jsonb NOT NULL DEFAULT '[{"from_min":15,"to_min":30,"amount":50},{"from_min":30,"to_min":60,"amount":100}]'::jsonb,
  late_in_half_day_after_min integer NOT NULL DEFAULT 60,
  late_in_full_day_after_min integer NOT NULL DEFAULT 120,
  grace_minutes_out integer NOT NULL DEFAULT 15,
  early_out_slabs jsonb NOT NULL DEFAULT '[{"from_min":15,"to_min":30,"amount":50},{"from_min":30,"to_min":60,"amount":100}]'::jsonb,
  early_out_half_day_after_min integer NOT NULL DEFAULT 60,
  early_out_full_day_after_min integer NOT NULL DEFAULT 120,
  absent_no_checkin_deduction text NOT NULL DEFAULT 'full_day',
  absent_no_checkout_deduction text NOT NULL DEFAULT 'full_day',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.discipline_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage discipline rules" ON public.discipline_rules FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Authenticated view discipline rules" ON public.discipline_rules FOR SELECT
  USING (auth.uid() IS NOT NULL);
INSERT INTO public.discipline_rules (id) VALUES (gen_random_uuid());
CREATE TRIGGER trg_disc_updated_at
  BEFORE UPDATE ON public.discipline_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.attendance_discipline_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  staff_id uuid NOT NULL,
  work_date date NOT NULL,
  scheduled_check_in time,
  scheduled_check_out time,
  late_in_minutes integer NOT NULL DEFAULT 0,
  early_out_minutes integer NOT NULL DEFAULT 0,
  fine_amount numeric NOT NULL DEFAULT 0,
  fine_reason text,
  is_absent boolean NOT NULL DEFAULT false,
  absent_reason text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, work_date)
);
ALTER TABLE public.attendance_discipline_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage discipline log" ON public.attendance_discipline_log FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Finance roles view discipline log" ON public.attendance_discipline_log FOR SELECT
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'ca'::app_role)
  );
CREATE POLICY "Staff view own discipline log" ON public.attendance_discipline_log FOR SELECT
  USING (staff_id = get_user_staff_id(auth.uid()));
CREATE POLICY "Users insert own discipline log" ON public.attendance_discipline_log FOR INSERT
  WITH CHECK (staff_id = get_user_staff_id(auth.uid()));
CREATE POLICY "Users update own discipline log" ON public.attendance_discipline_log FOR UPDATE
  USING (staff_id = get_user_staff_id(auth.uid()));

ALTER TABLE public.salary_settlements
  ADD COLUMN IF NOT EXISTS discipline_fine numeric NOT NULL DEFAULT 0;
