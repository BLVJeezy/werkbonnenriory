CREATE OR REPLACE FUNCTION public.fin_bank_tx_book_reconciled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN BEGIN PERFORM public.fin_book_reconciled_sales_tx(NEW.id); EXCEPTION WHEN others THEN NULL; END; RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.reconcile_sales_payment(p_id uuid, p_key text, p_amount numeric, p_ref text, p_date timestamp with time zone) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE r public.invoices; tx uuid;
BEGIN
 SELECT * INTO r FROM public.invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.kind='creditnota' OR p_amount<=0 OR abs((r.total-coalesce(r.paid_amount,0))-p_amount)>=0.005 THEN RETURN false; END IF;
 INSERT INTO public.ponto_reconciliations(transaction_key,invoice_id,amount,payment_ref,paid_at) VALUES(p_key,p_id,p_amount,p_ref,p_date) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.invoices SET paid_amount=r.total,paid_at=p_date WHERE id=p_id;
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') THEN
  FOR tx IN SELECT id FROM public.fin_bank_tx WHERE dedupe_key='ponto:'||p_key LOOP PERFORM public.fin_book_reconciled_sales_tx(tx); END LOOP;
 END IF;
 RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_book_reconciled_sales_tx(uuid) TO authenticated, service_role;