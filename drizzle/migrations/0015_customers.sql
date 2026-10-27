CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  street text, house_number text, postal_code text, city text,
  phone text, email text, vat_number text,
  match_key text GENERATED ALWAYS AS (lower(btrim(name)) || '|' || lower(btrim(coalesce(postal_code, '')))) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_match_key_idx ON public.customers (match_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.customers (name, street, house_number, postal_code, city, phone, email, vat_number)
SELECT DISTINCT ON (lower(btrim(customer_name)) || '|' || lower(btrim(coalesce(postal_code, ''))))
  btrim(customer_name), street, house_number, postal_code, city, phone, email, vat_number
FROM public.work_orders WHERE btrim(customer_name) <> ''
ORDER BY lower(btrim(customer_name)) || '|' || lower(btrim(coalesce(postal_code, ''))), created_at DESC;