-- =============================================================================
-- Harden the payment-request maker-checker control.
-- =============================================================================
-- Gaps closed:
--  * The old trigger was BEFORE UPDATE only, so salary payouts inserted directly
--    as status='approved' bypassed it. Now fires on INSERT OR UPDATE.
--  * requested_by was attacker-controllable; it is now immutable on update.
--  * The recorded approver must be the actual caller (no impersonation).
--  * The real control — "you cannot approve a payout to yourself" — is now
--    enforced server-side (beneficiary check), not only in client code.
--  * Salary payouts are owner-initiated + self-approved by design, so the
--    two-person rule applies only to advance/other requests (explicit carve-out).
-- SECURITY DEFINER so the beneficiary lookup on staff bypasses RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_request_maker_checker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beneficiary_user uuid;
BEGIN
  -- The requester is immutable once the row exists.
  IF TG_OP = 'UPDATE' AND NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'The requester of a payment request cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  -- Police any row that is (becoming) approved — on INSERT or UPDATE.
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.status, 'pending') <> 'approved') THEN

    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'Approver must be recorded when approving a request'
        USING ERRCODE = '23514';
    END IF;

    -- The recorded approver must be the actual caller. auth.uid() is NULL under
    -- service_role; allow that for server/edge contexts.
    IF auth.uid() IS NOT NULL AND NEW.approved_by <> auth.uid() THEN
      RAISE EXCEPTION 'The approver must be the current user'
        USING ERRCODE = '42501';
    END IF;

    -- Two-person rule for non-salary requests.
    IF COALESCE(NEW.payout_type, 'advance') <> 'salary' THEN
      IF NEW.approved_by = NEW.requested_by THEN
        RAISE EXCEPTION 'A payment request cannot be approved by the user who raised it'
          USING ERRCODE = '42501';
      END IF;
      SELECT user_id INTO beneficiary_user FROM public.staff WHERE id = NEW.staff_id;
      IF beneficiary_user IS NOT NULL AND NEW.approved_by = beneficiary_user THEN
        RAISE EXCEPTION 'You cannot approve a payout to yourself'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_requests_maker_checker ON public.payment_requests;
CREATE TRIGGER payment_requests_maker_checker
  BEFORE INSERT OR UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_request_maker_checker();

-- Belt-and-suspenders: an approved row must always carry an approver. NOT VALID
-- so existing rows aren't re-checked, but every new INSERT/UPDATE is.
ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_approved_has_approver;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_approved_has_approver
  CHECK (status <> 'approved' OR approved_by IS NOT NULL) NOT VALID;
