CREATE OR REPLACE FUNCTION public.fin_settle_paid_invoices(_transaction uuid, _invoices uuid[], _bank_account text, _counter_account text, _gross numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE t public.fin_bank_tx; f public.fin_invoices; tot numeric; sumtot numeric:=0; key text; entry uuid; uid uuid:=auth.uid(); fee numeric:=0; lines jsonb; inv uuid; nrs text:=''; names text:=''; first_inv uuid;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF _invoices IS NULL OR array_length(_invoices,1) IS NULL OR array_length(_invoices,1)>50 THEN RAISE EXCEPTION 'Kies 1 tot 50 facturen'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al gekoppeld'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_bank_account AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_counter_account AND active) THEN RAISE EXCEPTION 'Kies bestaande actieve grootboekrekeningen'; END IF;
 FOREACH inv IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(_invoices) x) LOOP
  SELECT * INTO f FROM public.fin_invoices WHERE id=inv AND company_id=t.company_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR f.doc_type<>'factuur' OR f.status<>'betaald' THEN RAISE EXCEPTION 'Kies facturen die als betaald gemarkeerd zijn'; END IF;
  IF EXISTS(SELECT 1 FROM public.fin_bank_tx WHERE matched_invoice_id=f.id) OR EXISTS(SELECT 1 FROM public.fin_bank_allocations WHERE invoice_id=f.id) THEN RAISE EXCEPTION 'Factuur % heeft al een betaling', f.number; END IF;
  IF (f.direction='verkoop' AND t.amount<=0) OR (f.direction='aankoop' AND t.amount>=0) THEN RAISE EXCEPTION 'Betalingsrichting past niet bij factuur %', f.number; END IF;
  SELECT coalesce(sum(ex_vat+vat),0) INTO tot FROM public.fin_invoice_lines WHERE invoice_id=f.id;
  sumtot:=sumtot+tot;
  nrs:=nrs||CASE WHEN nrs='' THEN '' ELSE ', ' END||coalesce(f.number,''); names:=names||CASE WHEN names='' THEN '' ELSE ', ' END||coalesce(f.counterparty,'');
  first_inv:=coalesce(first_inv,f.id);
 END LOOP;
 IF _gross IS NOT NULL THEN
  fee:=round(_gross-abs(t.amount),2);
  IF t.amount<=0 OR fee<0 OR fee>round(_gross*0.1,2) THEN RAISE EXCEPTION 'Bruto bedrag past niet bij deze verrichting'; END IF;
  IF fee>0 AND NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number='653000' AND active) THEN RAISE EXCEPTION 'Rekening 653000 (bankkosten) ontbreekt'; END IF;
 END IF;
 IF abs(abs(t.amount)+fee-sumtot)>0.025 THEN RAISE EXCEPTION 'Bedrag (%) verschilt van het totaal van de facturen (%)', abs(t.amount)+fee, sumtot; END IF;
 lines:=jsonb_build_array(jsonb_build_object('account',_bank_account,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0),'description',CASE WHEN fee>0 THEN 'Netto uitbetaling '||coalesce(t.counterparty,'') END),
  jsonb_build_object('account',_counter_account,'debit',greatest(-t.amount,0),'credit',greatest(t.amount,0)+fee,'description',CASE WHEN fee>0 THEN 'Bruto ontvangen facturen '||nrs END));
 IF fee>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account','653000','debit',fee,'credit',0,'description','Commissie kaartbetaling '||coalesce(t.counterparty,'')||' · facturen '||nrs||' · bruto '||to_char(_gross,'FM999999990.00')||' · netto '||to_char(abs(t.amount),'FM999999990.00')||' · commissie '||to_char(fee,'FM999999990.00'))); END IF;
 key:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 INSERT INTO public.ponto_reconciliations(transaction_key,amount,payment_ref,paid_at) VALUES(key,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Betaling '||names||' '||nrs,left(nrs,200),'bank',t.id::text,lines);
 UPDATE public.fin_bank_tx SET entry_id=entry,matched_invoice_id=first_inv WHERE id=t.id;
 UPDATE public.fin_invoices SET bank_ref=coalesce(bank_ref,key) WHERE id = ANY(_invoices);
 RETURN entry;
END $$;
REVOKE ALL ON FUNCTION public.fin_settle_paid_invoices(uuid,uuid[],text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_settle_paid_invoices(uuid,uuid[],text,text,numeric) TO authenticated;