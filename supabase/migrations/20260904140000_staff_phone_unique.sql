-- ============================================================================
-- One phone number, one employee.
--
-- resolve_login_email() finds an account by employee code, email OR phone, and
-- takes `limit 1`. With staff phone numbers becoming the way people sign in to
-- their own portal, two employees sharing a number would mean whoever the
-- planner happened to return first gets the login — silently, and differently
-- from one query to the next. Nothing prevented that: staff.phone had no
-- unique constraint and no index at all.
--
-- Indexed on the DIGITS, not the raw string, because that is what the resolver
-- compares — otherwise "98765 43210" and "9876543210" would be two different
-- numbers to the constraint and the same login to the resolver.
--
-- Partial, so it applies only where a number is actually set. 212 of 214 active
-- staff have no phone yet; they are untouched and stay signing in with their
-- employee code until someone fills the number in.
--
-- Verified clean before applying: zero duplicate numbers in the current data.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS staff_phone_digits_unique
  ON public.staff ((regexp_replace(phone, '[^0-9]', '', 'g')))
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
