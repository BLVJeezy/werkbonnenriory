CREATE TYPE public.app_role AS ENUM ('admin', 'technician');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.technicians ADD COLUMN user_id uuid UNIQUE;
ALTER TABLE public.technicians ADD COLUMN email text;

CREATE OR REPLACE FUNCTION public.my_technician_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.technicians WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'st',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products admin write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.materials ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

DROP POLICY "auth all" ON public.technicians;
DROP POLICY "auth all" ON public.work_orders;
DROP POLICY "auth all" ON public.time_entries;
DROP POLICY "auth all" ON public.materials;

CREATE POLICY "admin all" ON public.technicians FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tech own" ON public.technicians FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "admin all" ON public.work_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tech read" ON public.work_orders FOR SELECT TO authenticated
  USING (technician_id = public.my_technician_id());
CREATE POLICY "tech update" ON public.work_orders FOR UPDATE TO authenticated
  USING (technician_id = public.my_technician_id() AND status <> 'afgetekend')
  WITH CHECK (technician_id = public.my_technician_id());

CREATE POLICY "admin all" ON public.time_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tech own" ON public.time_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'));
CREATE POLICY "tech read" ON public.time_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id()));

CREATE POLICY "admin all" ON public.materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tech own" ON public.materials FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'));
CREATE POLICY "tech read" ON public.materials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id()));