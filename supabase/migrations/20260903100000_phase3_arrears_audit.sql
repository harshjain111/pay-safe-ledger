-- ============================================================================
-- PHASE 3 (Attendo rebuild): audit salary_arrears.
--
-- Process Payroll's "Adjust" drawer writes explicit adjustment lines as
-- pending salary_arrears rows (they fold into net pay at settle). House rule:
-- every mutation writes to audit_log — the table had no audit trigger.
-- ============================================================================

DROP TRIGGER IF EXISTS audit_salary_arrears ON public.salary_arrears;
CREATE TRIGGER audit_salary_arrears
AFTER INSERT OR UPDATE OR DELETE ON public.salary_arrears
FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();
