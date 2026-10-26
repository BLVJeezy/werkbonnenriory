CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hourly_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities read" ON public.activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "activities admin write" ON public.activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_address text NOT NULL DEFAULT 'Natveld 47, 3740 Bilzen',
  km_rate numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings admin write" ON public.settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.settings (id) VALUES (1);

ALTER TABLE public.products ADD COLUMN price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN unit_price numeric NOT NULL DEFAULT 0;

ALTER TABLE public.work_orders
  ADD COLUMN activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  ADD COLUMN vat_rate numeric NOT NULL DEFAULT 21,
  ADD COLUMN distance_km numeric,
  ADD COLUMN paid_method text,
  ADD COLUMN paid_amount numeric,
  ADD COLUMN paid_at timestamptz;