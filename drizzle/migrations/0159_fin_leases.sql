CREATE TABLE public.fin_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('operationeel','financieel')),
  name text NOT NULL,
  object text,
  start_date date NOT NULL,
  months integer NOT NULL CHECK (months > 0),
  monthly_amount numeric,
  principal numeric,
  annual_rate numeric,
  purchase_option numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_leases TO authenticated;
GRANT ALL ON public.fin_leases TO service_role;
ALTER TABLE public.fin_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_owner ON public.fin_leases FOR ALL TO authenticated
USING (user_id = auth.uid() AND owns_company(company_id))
WITH CHECK (user_id = auth.uid() AND owns_company(company_id));