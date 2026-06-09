-- =============================================================================
-- HR Module — Item 14: attendance-driven salary + configurable overtime
-- =============================================================================
-- Today the discipline engine only fines lateness/early-out on days actually
-- worked; an UNRECORDED ABSENCE (no check-in, no approved leave) is never
-- deducted and is silently paid in full. This adds an attendance day breakdown
-- and an additive "absent day" deduction so attendance changes flow into pay,
-- WITHOUT touching the existing proration / leave-deduction / discipline logic
-- (so nothing is double-counted: absent days have no session => no fine).
--
-- Overtime is also made configurable: a global standard shift length + multiplier
-- on the statutory singleton, overridable per staff. The per-settlement manual
-- override already exists (overtime_amount / overtime_override_reason).
-- =============================================================================

-- Attendance day breakdown + absence deduction (persisted for the salary sheet)
ALTER TABLE public.salary_settlements
  ADD COLUMN IF NOT EXISTS present_days           numeric,
  ADD COLUMN IF NOT EXISTS half_days              numeric,
  ADD COLUMN IF NOT EXISTS off_days               numeric,
  ADD COLUMN IF NOT EXISTS paid_leave_days        numeric,
  ADD COLUMN IF NOT EXISTS absent_days            numeric,
  ADD COLUMN IF NOT EXISTS absent_deduction_days  numeric,
  ADD COLUMN IF NOT EXISTS absent_deduction       numeric,
  ADD COLUMN IF NOT EXISTS absent_days_override   numeric;

-- Global overtime configuration (on the statutory settings singleton)
ALTER TABLE public.payroll_statutory_settings
  ADD COLUMN IF NOT EXISTS ot_enabled          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ot_standard_minutes integer NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS ot_multiplier       numeric NOT NULL DEFAULT 1.5;

-- Per-staff overtime overrides (NULL = use the global value)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS ot_standard_minutes_override integer
    CONSTRAINT staff_ot_minutes_override_chk CHECK (ot_standard_minutes_override IS NULL OR ot_standard_minutes_override > 0),
  ADD COLUMN IF NOT EXISTS ot_multiplier_override numeric
    CONSTRAINT staff_ot_multiplier_override_chk CHECK (ot_multiplier_override IS NULL OR ot_multiplier_override >= 1);
