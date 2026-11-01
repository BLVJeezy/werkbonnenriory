ALTER TABLE public.fin_invoices ADD COLUMN paid_amount numeric NOT NULL DEFAULT 0;
UPDATE public.fin_invoices f SET paid_amount=coalesce((SELECT sum(ex_vat+vat) FROM public.fin_invoice_lines WHERE invoice_id=f.id),0) WHERE status='betaald';
CREATE OR REPLACE FUNCTION public.fin_reconcile_bank(_transaction uuid,_invoice uuid,_bank_account text,_counter_account text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.fin_bank_tx; f public.fin_invoices; local public.invoices; claim public.ponto_reconciliations; amount numeric; total numeric; balance numeric; key text; entry uuid; paid numeric; existing_claim boolean:=false; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al gekoppeld'; END IF;
 SELECT * INTO f FROM public.fin_invoices WHERE id=_invoice AND company_id=t.company_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR f.doc_type<>'factuur' THEN RAISE EXCEPTION 'Kies een factuur, geen creditnota'; END IF;
 IF (f.direction='verkoop' AND t.amount<=0) OR (f.direction='aankoop' AND t.amount>=0) THEN RAISE EXCEPTION 'Betalingsrichting past niet bij de factuur'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_bank_account AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_counter_account AND active) THEN RAISE EXCEPTION 'Kies bestaande actieve grootboekrekeningen'; END IF;
 SELECT coalesce(sum(ex_vat+vat),0) INTO total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
 amount:=abs(t.amount); balance:=round(total-f.paid_amount,2);
 key:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 -- An imported historical payment or hourly Ponto claim is never added twice.
 SELECT * INTO claim FROM public.ponto_reconciliations WHERE transaction_key=key FOR UPDATE;
 existing_claim:=FOUND;
 IF f.direction='verkoop' AND EXISTS(SELECT 1 FROM public.companies WHERE id=f.company_id AND lower(trim(name))='riory bv') THEN
  SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND (('wb-'||id::text)=f.source_ref OR regexp_replace(upper(number),'\s','','g')=regexp_replace(upper(f.number),'\s','','g')) ORDER BY CASE WHEN ('wb-'||id::text)=f.source_ref THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE;
  IF FOUND AND abs(local.total-total)>0.005 THEN RAISE EXCEPTION 'Factuurbedragen verschillen; controleer de gekoppelde factuur'; END IF;
 END IF;
 IF existing_claim THEN
  IF local.id IS NULL OR claim.invoice_id IS DISTINCT FROM local.id OR abs(claim.amount-t.amount)>0.005 THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
  paid:=local.paid_amount;
 ELSE
  IF local.id IS NOT NULL THEN balance:=round(local.total-local.paid_amount,2); END IF;
  IF balance<=0 THEN RAISE EXCEPTION 'Deze factuur is al volledig betaald'; END IF;
  IF amount>balance THEN RAISE EXCEPTION 'Het bedrag is hoger dan het openstaande saldo'; END IF;
  INSERT INTO public.ponto_reconciliations(transaction_key,invoice_id,amount,payment_ref,paid_at) VALUES(key,local.id,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
  paid:=round(coalesce(local.paid_amount,f.paid_amount)+amount,2);
  IF local.id IS NOT NULL THEN UPDATE public.invoices SET paid_amount=paid,paid_at=CASE WHEN paid>=total THEN t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels' ELSE paid_at END WHERE id=local.id; END IF;
 END IF;
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Betaling '||coalesce(f.counterparty,'')||' '||coalesce(f.number,''),f.number,'bank',t.id::text,jsonb_build_array(jsonb_build_object('account',_bank_account,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0)),jsonb_build_object('account',_counter_account,'debit',greatest(-t.amount,0),'credit',greatest(t.amount,0))));
 UPDATE public.fin_bank_tx SET entry_id=entry,matched_invoice_id=f.id WHERE id=t.id;
 UPDATE public.fin_invoices SET paid_amount=paid,status=CASE WHEN paid>=total THEN 'betaald' ELSE 'open' END,paid_at=CASE WHEN paid>=total THEN t.tx_date ELSE NULL END,bank_ref=key WHERE id=f.id;
 RETURN jsonb_build_object('paidAmount',paid,'remaining',greatest(total-paid,0),'localInvoiceId',local.id,'entryId',entry);
END $$;
REVOKE ALL ON FUNCTION public.fin_reconcile_bank(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_reconcile_bank(uuid,uuid,text,text) TO authenticated;