
-- ============================================
-- ATTENDANCE MODULE
-- ============================================

-- 1. attendance_sessions table
CREATE TABLE public.attendance_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  staff_id UUID,
  work_date DATE NOT NULL,
  check_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  check_in_photo_url TEXT NOT NULL,
  check_in_lat NUMERIC,
  check_in_lng NUMERIC,
  check_in_accuracy NUMERIC,
  check_in_address TEXT,
  check_out_at TIMESTAMP WITH TIME ZONE,
  check_out_photo_url TEXT,
  check_out_lat NUMERIC,
  check_out_lng NUMERIC,
  check_out_accuracy NUMERIC,
  check_out_address TEXT,
  total_break_minutes INTEGER NOT NULL DEFAULT 0,
  worked_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  late_checkout BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_status_check
    CHECK (status IN ('active', 'on_break', 'completed'))
);

-- one open session per user
CREATE UNIQUE INDEX attendance_sessions_one_open_per_user
  ON public.attendance_sessions(user_id)
  WHERE status IN ('active', 'on_break');

CREATE INDEX attendance_sessions_user_date_idx
  ON public.attendance_sessions(user_id, work_date DESC);

CREATE INDEX attendance_sessions_staff_date_idx
  ON public.attendance_sessions(staff_id, work_date DESC);

-- 2. attendance_breaks table
CREATE TABLE public.attendance_breaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX attendance_breaks_session_idx
  ON public.attendance_breaks(session_id);

-- 3. updated_at trigger on sessions
CREATE TRIGGER update_attendance_sessions_updated_at
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_breaks ENABLE ROW LEVEL SECURITY;

-- attendance_sessions policies
CREATE POLICY "Users manage own attendance sessions select"
  ON public.attendance_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own attendance sessions"
  ON public.attendance_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own attendance sessions"
  ON public.attendance_sessions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Owners admins CA view all attendance sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ca'::app_role)
  );

CREATE POLICY "Owners manage all attendance sessions"
  ON public.attendance_sessions FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- attendance_breaks policies
CREATE POLICY "Users select own breaks"
  ON public.attendance_breaks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_breaks.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own breaks"
  ON public.attendance_breaks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_breaks.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own breaks"
  ON public.attendance_breaks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_breaks.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners admins CA view all breaks"
  ON public.attendance_breaks FOR SELECT
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ca'::app_role)
  );

CREATE POLICY "Owners manage all breaks"
  ON public.attendance_breaks FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- 5. Storage bucket for photos (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: path is {user_id}/{session_id}/{checkin|checkout}.jpg
CREATE POLICY "Users upload own attendance photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attendance-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users view own attendance photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attendance-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners admins CA view all attendance photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attendance-photos'
    AND (
      has_role(auth.uid(), 'owner'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'ca'::app_role)
    )
  );
