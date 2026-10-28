ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'factuur' CHECK (kind IN ('factuur','creditnota'));
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS payment_file_at timestamptz;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS bank_transaction_key text;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS bank_payment_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_bank_transaction_unique ON public.purchase_invoices(bank_transaction_key) WHERE bank_transaction_key IS NOT NULL;
CREATE TABLE public.ponto_reconciliations (transaction_key text PRIMARY KEY, purchase_invoice_id uuid REFERENCES public.purchase_invoices(id), invoice_id uuid REFERENCES public.invoices(id), amount numeric(12,2) NOT NULL, payment_ref text, paid_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.ponto_reconciliations TO authenticated;
GRANT ALL ON public.ponto_reconciliations TO service_role;
ALTER TABLE public.ponto_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bank reconciliation" ON public.ponto_reconciliations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins create bank reconciliation" ON public.ponto_reconciliations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.reconcile_purchase_payment(p_id uuid, p_key text, p_amount numeric, p_ref text, p_date timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.purchase_invoices; BEGIN
SELECT * INTO r FROM public.purchase_invoices WHERE id = p_id FOR UPDATE;
IF NOT FOUND OR r.status NOT IN ('goedgekeurd','betaling_klaargezet') OR abs(abs(r.total)-abs(p_amount)) >= 0.005 OR (r.kind='factuur' AND p_amount>=0) OR (r.kind='creditnota' AND p_amount<=0) THEN RETURN false; END IF;
INSERT INTO public.ponto_reconciliations(transaction_key,purchase_invoice_id,amount,payment_ref,paid_at) VALUES (p_key,p_id,p_amount,p_ref,p_date) ON CONFLICT DO NOTHING;
IF NOT FOUND THEN RETURN false; END IF;
UPDATE public.purchase_invoices SET status='betaald',paid_at=p_date,bank_transaction_key=p_key,bank_payment_ref=p_ref WHERE id=p_id;
RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_purchase_payment(uuid,text,numeric,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_purchase_payment(uuid,text,numeric,text,timestamptz) TO authenticated,service_role;