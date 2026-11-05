CREATE OR REPLACE FUNCTION public.fin_manual_bank_amounts(_direction text, _total numeric, _paid numeric, _amount numeric, _mode text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE delta numeric; next_paid numeric; excess numeric;
BEGIN
 IF _direction NOT IN ('aankoop','verkoop') OR _total<=0 OR _paid<0 OR _amount=0 OR _mode NOT IN ('overpayment','refund') THEN RAISE EXCEPTION 'Ongeldige factuur of verrichting'; END IF;
 delta:=round(_amount * CASE WHEN _direction='verkoop' THEN 1 ELSE -1 END,2);
 excess:=greatest(round(_paid-_total,2),0);
 IF _mode='refund' THEN
  IF delta>=0 THEN RAISE EXCEPTION 'Kies een terugstorting in de tegenovergestelde betalingsrichting'; END IF;
  IF excess<=0 THEN RAISE EXCEPTION 'Geen geregistreerd teveel betaald bedrag. Koppel eerst de oorspronkelijke betaling.'; END IF;
  IF -delta>excess THEN RAISE EXCEPTION 'Terugstorting is hoger dan het teveel betaalde bedrag (%)',excess; END IF;
 ELSE
  IF delta<=0 OR _paid+delta<=_total THEN RAISE EXCEPTION 'Kies een betaling die het factuurbedrag overschrijdt'; END IF;
 END IF;
 next_paid:=round(_paid+delta,2);
 RETURN jsonb_build_object('paidAmount',next_paid,'remaining',greatest(_total-next_paid,0),'overpaid',greatest(next_paid-_total,0));
END $$;
REVOKE ALL ON FUNCTION public.fin_manual_bank_amounts(text,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_manual_bank_amounts(text,numeric,numeric,numeric,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fin_link_manual_bank(_transaction uuid,_invoice uuid,_mode text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.fin_bank_tx; f public.fin_invoices; local public.invoices; uid uuid:=auth.uid(); invoice_total numeric; current_paid numeric; result jsonb; transaction_key_value text; entry uuid; bank_account_value text; counter_account_value text; lines jsonb;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al gekoppeld'; END IF;
 SELECT * INTO f FROM public.fin_invoices WHERE id=_invoice AND company_id=t.company_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR f.doc_type<>'factuur' THEN RAISE EXCEPTION 'Kies een factuur, geen creditnota'; END IF;
 bank_account_value:=t.bank_account;
 counter_account_value:=CASE WHEN f.direction='verkoop' THEN '400000' ELSE '440000' END;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=bank_account_value AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=counter_account_value AND active) THEN RAISE EXCEPTION 'Actieve bank- of tegenrekening ontbreekt'; END IF;
 SELECT coalesce(sum(ex_vat+vat),0) INTO invoice_total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
 current_paid:=coalesce(f.paid_amount,0);
 IF f.direction='verkoop' AND EXISTS(SELECT 1 FROM public.companies WHERE id=f.company_id AND lower(trim(name))='riory bv') THEN
  SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND ('wb-'||id::text)=f.source_ref FOR UPDATE;
  IF NOT FOUND THEN
   IF (SELECT count(*) FROM public.invoices WHERE kind='factuur' AND regexp_replace(upper(number),'\s','','g')=regexp_replace(upper(f.number),'\s','','g'))>1 THEN RAISE EXCEPTION 'Meerdere facturen met dit nummer'; END IF;
   SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND regexp_replace(upper(number),'\s','','g')=regexp_replace(upper(f.number),'\s','','g') FOR UPDATE;
  END IF;
  IF local.id IS NOT NULL THEN
   IF abs(local.total-invoice_total)>0.005 THEN RAISE EXCEPTION 'Factuurbedragen verschillen'; END IF;
   current_paid:=coalesce(local.paid_amount,0);
  END IF;
 END IF;
 result:=public.fin_manual_bank_amounts(f.direction,invoice_total,current_paid,t.amount,_mode);
 transaction_key_value:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 INSERT INTO public.ponto_reconciliations(transaction_key,invoice_id,amount,payment_ref,paid_at) VALUES(transaction_key_value,local.id,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
 lines:=jsonb_build_array(jsonb_build_object('account',bank_account_value,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0)),jsonb_build_object('account',counter_account_value,'debit',greatest(-t.amount,0),'credit',greatest(t.amount,0)));
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,CASE WHEN _mode='refund' THEN 'Terugstorting teveel betaald ' ELSE 'Betaling met teveel betaald bedrag ' END||coalesce(f.counterparty,'')||' '||coalesce(f.number,''),f.number,'bank',t.id::text,lines);
 UPDATE public.fin_bank_tx SET entry_id=entry,matched_invoice_id=f.id WHERE id=t.id;
 UPDATE public.fin_invoices SET paid_amount=(result->>'paidAmount')::numeric,status='betaald',paid_at=coalesce(paid_at,t.tx_date),bank_ref=transaction_key_value WHERE id=f.id;
 IF local.id IS NOT NULL THEN UPDATE public.invoices SET paid_amount=(result->>'paidAmount')::numeric,paid_at=coalesce(paid_at,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') WHERE id=local.id; END IF;
 RETURN result||jsonb_build_object('entryId',entry);
END $$;
REVOKE ALL ON FUNCTION public.fin_link_manual_bank(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_link_manual_bank(uuid,uuid,text) TO authenticated,service_role;