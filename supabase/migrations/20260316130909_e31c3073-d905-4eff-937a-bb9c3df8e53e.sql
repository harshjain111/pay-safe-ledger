
-- Custom expense categories table
CREATE TABLE public.custom_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text DEFAULT 'MoreHorizontal',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.custom_expense_categories ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view active categories
CREATE POLICY "Authenticated can view active categories"
  ON public.custom_expense_categories FOR SELECT TO authenticated
  USING (true);

-- Owner/Admin/Accountant can manage categories
CREATE POLICY "Finance roles can manage categories"
  ON public.custom_expense_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- Seed with existing categories
INSERT INTO public.custom_expense_categories (name, icon, sort_order) VALUES
  ('Travel', 'Plane', 1),
  ('Food & Meals', 'UtensilsCrossed', 2),
  ('Logistics', 'Truck', 3),
  ('Equipment', 'Wrench', 4),
  ('Office Supplies', 'Briefcase', 5),
  ('Communication', 'Phone', 6),
  ('Other', 'MoreHorizontal', 7);

-- Clubs table
CREATE TABLE public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view active clubs
CREATE POLICY "Authenticated can view clubs"
  ON public.clubs FOR SELECT TO authenticated
  USING (true);

-- Owner/Admin/Accountant can manage clubs
CREATE POLICY "Finance roles can manage clubs"
  ON public.clubs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- Add club_id to expenses
ALTER TABLE public.expenses ADD COLUMN club_id uuid REFERENCES public.clubs(id);
