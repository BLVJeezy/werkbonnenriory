CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  street text, house_number text, postal_code text, city text,
  country text NOT NULL DEFAULT 'BE',
  lat double precision, lon double precision,
  dutch_billing boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ingelogden lezen vestigingen" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin beheert vestigingen" ON public.branches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.customers ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL, ADD COLUMN branch_manual boolean NOT NULL DEFAULT false;
ALTER TABLE public.work_orders ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;