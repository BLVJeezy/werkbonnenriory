ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS next_invoice_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS terms_text text,
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT 'Riory bv',
  ADD COLUMN IF NOT EXISTS company_vat text NOT NULL DEFAULT 'BE0840931404',
  ADD COLUMN IF NOT EXISTS company_iban text,
  ADD COLUMN IF NOT EXISTS company_bic text;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  work_order_id uuid NOT NULL UNIQUE REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  customer jsonb NOT NULL,
  lines jsonb NOT NULL,
  vat_rate numeric NOT NULL,
  net numeric NOT NULL,
  vat numeric NOT NULL,
  total numeric NOT NULL,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'concept',
  sent_via text,
  sent_to text,
  sent_at timestamptz,
  send_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Atomically hands out the next invoice number (continues from the number set in settings).
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; p text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.settings SET next_invoice_number = next_invoice_number + 1 WHERE id = 1
    RETURNING next_invoice_number - 1, invoice_prefix INTO n, p;
  RETURN p || n::text;
END $$;
REVOKE ALL ON FUNCTION public.next_invoice_number() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;