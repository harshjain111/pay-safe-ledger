CREATE OR REPLACE FUNCTION public.log_discipline_cancellation_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_cancelled, false) IS DISTINCT FROM COALESCE(NEW.is_cancelled, false) THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (
      'attendance_discipline_log',
      NEW.id,
      CASE WHEN NEW.is_cancelled THEN 'PENALTY_WAIVED' ELSE 'PENALTY_RESTORED' END,
      jsonb_build_object(
        'is_cancelled', OLD.is_cancelled,
        'cancelled_by', OLD.cancelled_by,
        'cancelled_by_name', OLD.cancelled_by_name,
        'cancelled_at', OLD.cancelled_at,
        'cancellation_reason', OLD.cancellation_reason,
        'fine_amount', OLD.fine_amount,
        'work_date', OLD.work_date,
        'staff_id', OLD.staff_id
      ),
      jsonb_build_object(
        'is_cancelled', NEW.is_cancelled,
        'cancelled_by', NEW.cancelled_by,
        'cancelled_by_name', NEW.cancelled_by_name,
        'cancelled_at', NEW.cancelled_at,
        'cancellation_reason', NEW.cancellation_reason,
        'fine_amount', NEW.fine_amount,
        'work_date', NEW.work_date,
        'staff_id', NEW.staff_id
      ),
      COALESCE(NEW.cancelled_by, auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_discipline_cancellation_audit ON public.attendance_discipline_log;
CREATE TRIGGER trg_log_discipline_cancellation_audit
AFTER UPDATE ON public.attendance_discipline_log
FOR EACH ROW
EXECUTE FUNCTION public.log_discipline_cancellation_audit();