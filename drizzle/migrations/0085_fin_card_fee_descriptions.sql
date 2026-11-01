CREATE OR REPLACE FUNCTION public.fin_reconcile_bank(_transaction uuid, _invoice uuid, _bank_account text, _counter_account text, _gross numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.fin_bank_tx; f public.fin_invoices; local public.invoices; claim public.ponto_reconciliations; amount numeric; total numeric; balance numeric; key text; entry uuid; paid numeric; existing_claim boolean:=false; uid uuid:=auth.uid(); fee numeric:=0; lines jsonb;
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
 balance:=round(total-f.paid_amount,2);
 IF _gross IS NOT NULL THEN
  fee:=round(_gross-abs(t.amount),2);
  IF t.amount<=0 OR fee<0 OR fee>round(_gross*0.1,2) THEN RAISE EXCEPTION 'Bruto bedrag past niet bij deze verrichting'; END IF;
  IF fee>0 AND NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number='653000' AND active) THEN RAISE EXCEPTION 'Rekening 653000 (bankkosten) ontbreekt'; END IF;
 END IF;
 lines:=jsonb_build_array(jsonb_build_object('account',_bank_account,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0),'description',CASE WHEN fee>0 THEN 'Netto uitbetaling '||coalesce(t.counterparty,'') END),jsonb_build_object('account',_counter_account,'debit',greatest(-t.amount,0),'credit',greatest(t.amount,0)+fee,'description',CASE WHEN fee>0 THEN 'Bruto ontvangen factuur '||coalesce(f.number,'') END));
 IF fee>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account','653000','debit',fee,'credit',0,'description','Commissie kaartbetaling '||coalesce(t.counterparty,'')||' · factuur '||coalesce(f.number,'')||' · bruto '||to_char(_gross,'FM999999990.00')||' · netto '||to_char(abs(t.amount),'FM999999990.00')||' · commissie '||to_char(fee,'FM999999990.00'))); END IF;
 amount:=abs(t.amount)+fee;
 key:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
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
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Betaling '||coalesce(f.counterparty,'')||' '||coalesce(f.number,''),f.number,'bank',t.id::text,lines);
 UPDATE public.fin_bank_tx SET entry_id=entry,matched_invoice_id=f.id WHERE id=t.id;
 UPDATE public.fin_invoices SET paid_amount=paid,status=CASE WHEN paid>=total THEN 'betaald' ELSE 'open' END,paid_at=CASE WHEN paid>=total THEN t.tx_date ELSE NULL END,bank_ref=key WHERE id=f.id;
 RETURN jsonb_build_object('paidAmount',paid,'remaining',greatest(total-paid,0),'localInvoiceId',local.id,'entryId',entry);
END $function$;
CREATE OR REPLACE FUNCTION public.fin_settle_paid_invoice(_transaction uuid, _invoice uuid, _bank_account text, _counter_account text, _gross numeric DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.fin_bank_tx; f public.fin_invoices; total numeric; key text; entry uuid; uid uuid:=auth.uid(); fee numeric:=0; lines jsonb;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al gekoppeld'; END IF;
 SELECT * INTO f FROM public.fin_invoices WHERE id=_invoice AND company_id=t.company_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR f.doc_type<>'factuur' OR f.status<>'betaald' THEN RAISE EXCEPTION 'Kies een factuur die als betaald gemarkeerd is'; END IF;
 IF EXISTS(SELECT 1 FROM public.fin_bank_tx WHERE matched_invoice_id=f.id) THEN RAISE EXCEPTION 'Deze factuur heeft al een betaling'; END IF;
 IF (f.direction='verkoop' AND t.amount<=0) OR (f.direction='aankoop' AND t.amount>=0) THEN RAISE EXCEPTION 'Betalingsrichting past niet bij de factuur'; END IF;
 SELECT coalesce(sum(ex_vat+vat),0) INTO total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_bank_account AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_counter_account AND active) THEN RAISE EXCEPTION 'Kies bestaande actieve grootboekrekeningen'; END IF;
 IF _gross IS NOT NULL THEN
  fee:=round(_gross-abs(t.amount),2);
  IF t.amount<=0 OR fee<0 OR fee>round(_gross*0.1,2) THEN RAISE EXCEPTION 'Bruto bedrag past niet bij deze verrichting'; END IF;
  IF fee>0 AND NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number='653000' AND active) THEN RAISE EXCEPTION 'Rekening 653000 (bankkosten) ontbreekt'; END IF;
 END IF;
 lines:=jsonb_build_array(jsonb_build_object('account',_bank_account,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0),'description',CASE WHEN fee>0 THEN 'Netto uitbetaling '||coalesce(t.counterparty,'') END),jsonb_build_object('account',_counter_account,'debit',greatest(-t.amount,0),'credit',greatest(t.amount,0)+fee,'description',CASE WHEN fee>0 THEN 'Bruto ontvangen factuur '||coalesce(f.number,'') END));
 IF fee>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account','653000','debit',fee,'credit',0,'description','Commissie kaartbetaling '||coalesce(t.counterparty,'')||' · factuur '||coalesce(f.number,'')||' · bruto '||to_char(_gross,'FM999999990.00')||' · netto '||to_char(abs(t.amount),'FM999999990.00')||' · commissie '||to_char(fee,'FM999999990.00'))); END IF;
 IF abs(abs(t.amount)+fee-total)>0.025 THEN RAISE EXCEPTION 'Bedrag verschilt van het factuurbedrag'; END IF;
 key:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 INSERT INTO public.ponto_reconciliations(transaction_key,amount,payment_ref,paid_at) VALUES(key,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Betaling '||coalesce(f.counterparty,'')||' '||coalesce(f.number,''),f.number,'bank',t.id::text,lines);
 UPDATE public.fin_bank_tx SET entry_id=entry,matched_invoice_id=f.id WHERE id=t.id;
 UPDATE public.fin_invoices SET bank_ref=coalesce(bank_ref,key) WHERE id=f.id;
 RETURN entry;
END $function$;