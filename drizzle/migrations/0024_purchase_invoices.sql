CREATE TABLE public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text NOT NULL DEFAULT 'Onbekend',
  supplier_vat text,
  supplier_iban text,
  invoice_number text,
  invoice_date date,
  due_date date,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  net numeric(10,2) NOT NULL DEFAULT 0,
  vat numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  payment_ref text,
  source text NOT NULL DEFAULT 'mail',
  status text NOT NULL DEFAULT 'te_controleren',
  pdf_path text,
  email_message_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins beheren aankoopfacturen" ON public.purchase_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));