CREATE OR REPLACE FUNCTION public.fin_book_reconciled_sales_tx(_tx uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.fin_bank_tx; r public.ponto_reconciliations; loc public.invoices; f public.fin_invoices; ctrl text; e uuid;
BEGIN
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_tx FOR UPDATE;
 IF NOT FOUND OR t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL OR t.dedupe_key NOT LIKE 'ponto:%' OR t.amount<=0 THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.ponto_reconciliations WHERE transaction_key=substr(t.dedupe_key,7) AND invoice_id IS NOT NULL;
 IF NOT FOUND OR abs(r.amount-t.amount)>=0.005 THEN RETURN NULL; END IF;
 SELECT * INTO loc FROM public.invoices WHERE id=r.invoice_id;
 SELECT * INTO f FROM public.fin_invoices WHERE company_id=t.company_id AND doc_type='factuur' AND direction='verkoop'
   AND (source_ref='wb-'||loc.id::text OR regexp_replace(upper(number),'\s','','g')=regexp_replace(upper(loc.number),'\s','','g')) LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 ctrl:=public.fin_active_control_account(t.company_id,'verkoop');
 IF ctrl IS NULL OR t.bank_account IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.fin_journal_entries(user_id,company_id,journal,entry_date,description,reference,source,source_ref)
  VALUES(t.user_id,t.company_id,'bank',t.tx_date,'Betaling '||coalesce(f.counterparty,'')||' '||coalesce(f.number,''),f.number,'bank',t.id::text) RETURNING id INTO e;
 INSERT INTO public.fin_journal_lines(user_id,company_id,entry_id,account,debit,credit) VALUES
  (t.user_id,t.company_id,e,t.bank_account,t.amount,0),(t.user_id,t.company_id,e,ctrl,0,t.amount);
 UPDATE public.fin_bank_tx SET entry_id=e,matched_invoice_id=f.id WHERE id=t.id;
 UPDATE public.fin_invoices SET paid_amount=coalesce(loc.paid_amount,paid_amount),status=CASE WHEN coalesce(loc.paid_amount,0)>=loc.total-0.005 THEN 'betaald' ELSE status END,paid_at=coalesce(paid_at,t.tx_date),bank_ref=coalesce(bank_ref,r.transaction_key) WHERE id=f.id;
 RETURN e;
END $$;
REVOKE ALL ON FUNCTION public.fin_book_reconciled_sales_tx(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_bank_tx_book_reconciled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.fin_book_reconciled_sales_tx(NEW.id); RETURN NULL; END $$;
DROP TRIGGER IF EXISTS fin_bank_tx_book_reconciled ON public.fin_bank_tx;
CREATE TRIGGER fin_bank_tx_book_reconciled AFTER INSERT ON public.fin_bank_tx FOR EACH ROW EXECUTE FUNCTION public.fin_bank_tx_book_reconciled();

CREATE OR REPLACE FUNCTION public.reconcile_sales_payment(p_id uuid, p_key text, p_amount numeric, p_ref text, p_date timestamp with time zone) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE r public.invoices; tx uuid;
BEGIN
 SELECT * INTO r FROM public.invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.kind='creditnota' OR p_amount<=0 OR abs((r.total-coalesce(r.paid_amount,0))-p_amount)>=0.005 THEN RETURN false; END IF;
 INSERT INTO public.ponto_reconciliations(transaction_key,invoice_id,amount,payment_ref,paid_at) VALUES(p_key,p_id,p_amount,p_ref,p_date) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.invoices SET paid_amount=r.total,paid_at=p_date WHERE id=p_id;
 FOR tx IN SELECT id FROM public.fin_bank_tx WHERE dedupe_key='ponto:'||p_key LOOP PERFORM public.fin_book_reconciled_sales_tx(tx); END LOOP;
 RETURN true;
END $$;

DO $$ DECLARE x uuid; BEGIN
 FOR x IN SELECT t.id FROM public.fin_bank_tx t JOIN public.ponto_reconciliations r ON 'ponto:'||r.transaction_key=t.dedupe_key
   WHERE r.invoice_id IS NOT NULL AND t.entry_id IS NULL AND t.matched_invoice_id IS NULL LOOP
  PERFORM public.fin_book_reconciled_sales_tx(x); END LOOP; END $$;