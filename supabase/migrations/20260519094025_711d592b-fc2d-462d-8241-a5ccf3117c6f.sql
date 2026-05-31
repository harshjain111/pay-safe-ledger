CREATE TABLE IF NOT EXISTS public.whatsapp_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid,
  staff_phone text NOT NULL,
  event_type text NOT NULL,
  slab text NOT NULL,
  template_name text NOT NULL,
  deduction_amount numeric NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false,
  error_message text,
  meta_message_id text
);

ALTER TABLE public.whatsapp_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles view whatsapp log"
ON public.whatsapp_notification_log
FOR SELECT
USING (
  has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'ca'::app_role)
);

CREATE POLICY "Owners manage whatsapp log"
ON public.whatsapp_notification_log
FOR ALL
USING (has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_staff ON public.whatsapp_notification_log(staff_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_sent_at ON public.whatsapp_notification_log(sent_at DESC);