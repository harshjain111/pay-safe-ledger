-- ============================================================================
-- Switch "Unpaid Leave" back on.
--
-- Only Weekly Off and Paid Leave were active, and both deduct nothing — so
-- there was no way to record a day that is genuinely not paid. Approvers had to
-- pick a PAID type and then force a deduction on top of it, producing records
-- that read "Paid Leave, 1 day deducted": correct money, self-contradictory
-- history, and impossible to tell later from a mistake.
--
-- With UL selectable, "employee took an unauthorised day" has a type whose own
-- rule does the deduction, and the override in the approval dialog goes back to
-- being what it is meant for — half days, and paid leave approved with no
-- balance left.
--
-- Nothing is recalculated: this only makes an existing type selectable again.
-- No leave record changes, and no pay changes. UL accrues nothing (accrual
-- 'none', quota 0), so it adds no entitlement to anybody's balance — it is a
-- label for a day that costs the employee a day's pay.
-- ============================================================================

UPDATE public.leave_types
   SET is_active = true
 WHERE code = 'UL'
   AND NOT is_active;
