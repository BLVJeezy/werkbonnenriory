CREATE TABLE IF NOT EXISTS public.customer_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_sectors_name_unique
  ON public.customer_sectors (lower(trim(name)));

GRANT SELECT, INSERT, UPDATE ON public.customer_sectors TO authenticated;
GRANT ALL ON public.customer_sectors TO service_role;

ALTER TABLE public.customer_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin en marketing lezen sectoren"
  ON public.customer_sectors
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'marketing'::public.app_role)
  );

CREATE POLICY "Admin maakt sectoren aan"
  ON public.customer_sectors
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin bewerkt sectoren"
  ON public.customer_sectors
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES public.customer_sectors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_sector_id ON public.customers(sector_id);