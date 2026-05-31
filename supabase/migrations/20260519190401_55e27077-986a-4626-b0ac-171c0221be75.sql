ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS overtime_reminder_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;