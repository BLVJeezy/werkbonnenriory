ALTER TABLE public.work_orders ADD COLUMN project_name text;
ALTER TABLE public.customers ADD COLUMN project_name text;
ALTER TABLE public.products ADD COLUMN admin_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN kind text NOT NULL DEFAULT 'factuur';
ALTER TABLE public.invoices ADD COLUMN credit_for uuid;
ALTER TABLE public.settings ADD COLUMN next_quote_number integer NOT NULL DEFAULT 1;
ALTER TABLE public.settings ADD COLUMN accountant_email text NOT NULL DEFAULT 'peter@trivisio.be';

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL,
  customer jsonb NOT NULL,
  lines jsonb NOT NULL,
  vat_rate numeric NOT NULL DEFAULT 21,
  net numeric NOT NULL,
  vat numeric NOT NULL,
  total numeric NOT NULL,
  status text NOT NULL DEFAULT 'concept',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  signature text,
  signed_name text,
  signed_at timestamptz,
  sent_at timestamptz,
  work_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.quotes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "products read" ON public.products;
CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR NOT admin_only);

CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  UPDATE settings SET next_quote_number = next_quote_number + 1 WHERE id = 1 RETURNING next_quote_number - 1 INTO n;
  RETURN 'OFF-' || n;
END
$$;
GRANT EXECUTE ON FUNCTION public.next_quote_number() TO authenticated;