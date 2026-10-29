CREATE TABLE public.ponto_transactions (
  transaction_key text PRIMARY KEY,
  account_id text NOT NULL,
  amount numeric(12,2) NOT NULL,
  remittance text,
  counterpart_name text,
  execution_date date,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ponto_transactions TO authenticated;
GRANT ALL ON public.ponto_transactions TO service_role;
ALTER TABLE public.ponto_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bank transactions" ON public.ponto_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins store bank transactions" ON public.ponto_transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX ponto_transactions_execution_date_idx ON public.ponto_transactions (execution_date DESC);