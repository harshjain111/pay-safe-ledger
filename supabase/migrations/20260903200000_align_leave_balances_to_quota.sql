-- ============================================================================
-- Settle the paid-leave entitlement at the configured quota (24 days/year).
--
-- Two numbers claimed to be "the paid-leave entitlement":
--   * leave_types (PL, is_default)          default_quota = 24, annual accrual
--   * employee_leave_balance.balance         12.00, for all 214 staff
--
-- The 24 is the configured rule and the one the employee dashboard and the
-- payslip already compute from (accruedForType → default_quota). The uniform
-- 12.00 is a bulk default left by an earlier version of the leave feature
-- (DEFAULT_LEAVE_SETTINGS.annual_quota), not a per-employee decision — every
-- one of the 214 rows holds exactly 12.00.
--
-- So the stored balances move to the quota, and every move gets a
-- leave_balance_adjustment row, the same audit trail a Bulk Adjust writes.
-- Only rows that differ from the quota are touched, so a balance an HR has
-- deliberately set to the quota is left alone.
--
-- From here the quota is editable in Settings → Attendance & Leave → "Paid
-- Leave Entitlement", which writes leave_types.default_quota and offers the
-- same balance alignment as a button.
-- ============================================================================

-- Audit first: reads the pre-update balances.
INSERT INTO public.leave_balance_adjustment
  (staff_id, leave_type_id, old_balance, new_balance, remarks, adjusted_by)
SELECT b.staff_id,
       b.leave_type_id,
       b.balance,
       t.default_quota,
       'Aligned to the configured paid-leave entitlement (' || t.default_quota || ' days/year).',
       NULL
  FROM public.employee_leave_balance b
  JOIN public.leave_types t ON t.id = b.leave_type_id
 WHERE t.is_default
   AND t.is_active
   AND t.accrual <> 'none'
   AND b.balance <> t.default_quota;

UPDATE public.employee_leave_balance b
   SET balance = t.default_quota,
       updated_at = now()
  FROM public.leave_types t
 WHERE t.id = b.leave_type_id
   AND t.is_default
   AND t.is_active
   AND t.accrual <> 'none'
   AND b.balance <> t.default_quota;

-- Keep the legacy singleton in step, so the fallback path in
-- fetchLeaveSettings() can never resurface the stale 12.
UPDATE public.leave_settings s
   SET annual_quota = t.default_quota,
       accrual      = t.accrual,
       updated_at   = now()
  FROM public.leave_types t
 WHERE t.is_default AND t.is_active AND t.accrual <> 'none';
