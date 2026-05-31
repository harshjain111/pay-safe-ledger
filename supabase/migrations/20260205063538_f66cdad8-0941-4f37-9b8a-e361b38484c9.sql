-- Create events table for optional event/party tracking
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  location text NOT NULL,
  client_name text NULL,
  created_by uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add optional event_id to expenses table
ALTER TABLE public.expenses
ADD COLUMN event_id uuid NULL REFERENCES public.events(id) ON DELETE SET NULL;

-- Enable RLS on events table
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events table

-- Owners can manage all events
CREATE POLICY "Owners can manage all events"
ON public.events
FOR ALL
USING (has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- Admins can create and view events
CREATE POLICY "Admins can create events"
ON public.events
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view events"
ON public.events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Accountants can create and view events
CREATE POLICY "Accountants can create events"
ON public.events
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Accountants can view events"
ON public.events
FOR SELECT
USING (has_role(auth.uid(), 'accountant'::app_role));

-- Staff can view events (for expense dropdown) but cannot create
CREATE POLICY "Staff can view events"
ON public.events
FOR SELECT
USING (has_role(auth.uid(), 'staff'::app_role));

-- CA can view events for reporting
CREATE POLICY "CA can view events"
ON public.events
FOR SELECT
USING (has_role(auth.uid(), 'ca'::app_role));

-- Add index for better query performance
CREATE INDEX idx_events_event_date ON public.events(event_date DESC);
CREATE INDEX idx_expenses_event_id ON public.expenses(event_id);

-- Add comments
COMMENT ON TABLE public.events IS 'Events/parties that expenses can be optionally linked to';
COMMENT ON COLUMN public.events.event_date IS 'Date of the event (required)';
COMMENT ON COLUMN public.events.location IS 'Location of the event (required)';
COMMENT ON COLUMN public.events.client_name IS 'Optional client name associated with the event';
COMMENT ON COLUMN public.expenses.event_id IS 'Optional link to an event this expense belongs to';