ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS geo_flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS payroll_group_id UUID;
NOTIFY pgrst, 'reload schema';