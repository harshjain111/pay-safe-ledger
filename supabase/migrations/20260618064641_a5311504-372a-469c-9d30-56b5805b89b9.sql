-- Ensure date_of_leaving + separation_reason columns exist, and refresh the staff_sync_status trigger function so cached plans pick up the columns.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS date_of_leaving DATE;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS separation_reason TEXT;

DROP TRIGGER IF EXISTS trg_staff_sync_status ON public.staff;
DROP FUNCTION IF EXISTS public.staff_sync_status() CASCADE;

CREATE OR REPLACE FUNCTION public.staff_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;

  NEW.is_active := (NEW.status = 'active');

  IF NEW.status IN ('left','terminated') THEN
    IF NEW.date_of_leaving IS NULL THEN
      NEW.date_of_leaving := CURRENT_DATE;
    END IF;
  ELSIF NEW.status = 'active' THEN
    NEW.date_of_leaving := NULL;
    NEW.separation_reason := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_staff_sync_status
BEFORE INSERT OR UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.staff_sync_status();

NOTIFY pgrst, 'reload schema';