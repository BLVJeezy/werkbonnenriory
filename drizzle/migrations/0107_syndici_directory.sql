CREATE TABLE public.syndici (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  contact text,
  vat_number text,
  street text,
  house_number text,
  postal_code text,
  city text,
  phone text,
  email text,
  billing_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX syndici_company_key ON public.syndici (lower(btrim(company)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.syndici TO authenticated;
GRANT ALL ON public.syndici TO service_role;
ALTER TABLE public.syndici ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin beheert syndici" ON public.syndici FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.syndici (company, contact, vat_number, street, house_number, postal_code, city, phone, email, billing_email)
SELECT DISTINCT ON (lower(btrim(coalesce(nullif(btrim(c.syndicus_company), ''), nullif(btrim(c.syndicus), '')))))
  coalesce(nullif(btrim(c.syndicus_company), ''), nullif(btrim(c.syndicus), '')),
  nullif(btrim(c.syndicus_contact), ''),
  nullif(btrim(c.syndicus_vat_number), ''),
  nullif(btrim(c.syndicus_street), ''),
  nullif(btrim(c.syndicus_house_number), ''),
  nullif(btrim(c.syndicus_postal_code), ''),
  nullif(btrim(c.syndicus_city), ''),
  nullif(btrim(c.syndicus_phone), ''),
  nullif(btrim(c.syndicus_email), ''),
  nullif(btrim(c.syndicus_billing_email), '')
FROM public.customers c
WHERE coalesce(nullif(btrim(c.syndicus_company), ''), nullif(btrim(c.syndicus), '')) IS NOT NULL
ORDER BY lower(btrim(coalesce(nullif(btrim(c.syndicus_company), ''), nullif(btrim(c.syndicus), '')))),
  (
    (case when nullif(btrim(coalesce(c.syndicus_contact, '')), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(c.syndicus_vat_number, '')), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(c.syndicus_street, '')), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(c.syndicus_city, '')), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(c.syndicus_phone, '')), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(c.syndicus_email, '')), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(coalesce(c.syndicus_billing_email, '')), '') is not null then 1 else 0 end)
  ) DESC,
  c.id
ON CONFLICT (lower(btrim(company))) DO NOTHING;