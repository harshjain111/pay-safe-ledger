
-- Staff employment status: active / inactive / left / terminated
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS separation_reason text;

-- Backfill from existing is_active
UPDATE public.staff
   SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
 WHERE status IS NULL OR status = 'active' AND is_active = false;

-- Constrain values
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_status_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_status_check
  CHECK (status IN ('active','inactive','left','terminated'));

-- Sync is_active with status, and manage date_of_leaving
CREATE OR REPLACE FUNCTION public.staff_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;

  NEW.is_active := (NEW.status = 'active');

  -- Set date_of_leaving when transitioning to left/terminated; clear when reactivated
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
$$;

DROP TRIGGER IF EXISTS trg_staff_sync_status ON public.staff;
CREATE TRIGGER trg_staff_sync_status
BEFORE INSERT OR UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.staff_sync_status();
