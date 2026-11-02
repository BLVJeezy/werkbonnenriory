CREATE OR REPLACE FUNCTION public.fin_reconcile_bank_multi(_transaction uuid, _invoices uuid[], _bank_account text, _counter_account text, _gross numeric DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.fin_bank_tx; f public.fin_invoices; local public.invoices; uid uuid:=auth.uid(); fee numeric:=0; diff numeric; lines jsonb; key text; entry uuid;
 total numeric; bal numeric; sumbal numeric:=0; gross numeric; inv uuid; is_riory boolean; dir text; nrs text:=''; names text:=''; first_inv uuid; n int:=0;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF _invoices IS NULL OR array_length(_invoices,1) IS NULL OR array_length(_invoices,1)>50 THEN RAISE EXCEPTION 'Kies 1 tot 50 facturen'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al gekoppeld'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_bank_account AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_counter_account AND active) THEN RAISE EXCEPTION 'Kies bestaande actieve grootboekrekeningen'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number='653000' AND active) THEN RAISE EXCEPTION 'Rekening 653000 (bankkosten) ontbreekt'; END IF;
 is_riory:=EXISTS(SELECT 1 FROM public.companies WHERE id=t.company_id AND lower(trim(name))='riory bv');
 key:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 IF EXISTS(SELECT 1 FROM public.ponto_reconciliations WHERE transaction_key=key) THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
 -- Eerst alle saldi bepalen en vergrendelen.
 FOREACH inv IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(_invoices) x) LOOP
  SELECT * INTO f FROM public.fin_invoices WHERE id=inv AND company_id=t.company_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR f.doc_type<>'factuur' THEN RAISE EXCEPTION 'Kies facturen, geen creditnota'; END IF;
  IF dir IS NULL THEN dir:=f.direction; ELSIF dir<>f.direction THEN RAISE EXCEPTION 'Meng geen aankoop- en verkoopfacturen'; END IF;
  IF (f.direction='verkoop' AND t.amount<=0) OR (f.direction='aankoop' AND t.amount>=0) THEN RAISE EXCEPTION 'Betalingsrichting past niet bij factuur %', f.number; END IF;
  SELECT coalesce(sum(ex_vat+vat),0) INTO total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
  bal:=round(total-f.paid_amount,2);
  local:=NULL;
  IF f.direction='verkoop' AND is_riory THEN
   SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND (('wb-'||id::text)=f.source_ref OR regexp_replace(upper(number),'\s','','g')=regexp_replace(upper(f.number),'\s','','g')) ORDER BY CASE WHEN ('wb-'||id::text)=f.source_ref THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE;
   IF FOUND THEN bal:=round(local.total-local.paid_amount,2); END IF;
  END IF;
  IF bal<=0 THEN RAISE EXCEPTION 'Factuur % is al volledig betaald', f.number; END IF;
  sumbal:=sumbal+bal; n:=n+1;
 END LOOP;
 gross:=coalesce(_gross,abs(t.amount));
 IF _gross IS NOT NULL THEN
  fee:=round(_gross-abs(t.amount),2);
  IF t.amount<=0 OR fee<0 OR fee>round(_gross*0.1,2) THEN RAISE EXCEPTION 'Bruto bedrag past niet bij deze verrichting'; END IF;
 END IF;
 diff:=round(gross-sumbal,2); -- positief = te veel betaald
 IF diff>0.02 THEN RAISE EXCEPTION 'Het bedrag (%) is hoger dan het openstaande saldo (%)', gross, sumbal; END IF;
 IF n=1 AND diff<-0.02 THEN NULL; -- gedeeltelijke betaling van één factuur mag
 ELSIF diff<-0.02 THEN RAISE EXCEPTION 'Het bedrag (%) dekt de gekozen facturen (%) niet volledig', gross, sumbal; END IF;
 -- Afrondingsverschil tot 2 cent gaat mee met de bankkosten; de facturen worden volledig afgeletterd.
 IF abs(diff)<=0.02 THEN fee:=fee-diff; ELSE fee:=fee; END IF;
 IF t.amount>0 THEN
  lines:=jsonb_build_array(jsonb_build_object('account',_bank_account,'debit',t.amount,'credit',0),
   jsonb_build_object('account',_counter_account,'debit',0,'credit',CASE WHEN abs(diff)<=0.02 THEN sumbal ELSE gross END));
  IF fee>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account','653000','debit',fee,'credit',0));
  ELSIF fee<0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account','653000','debit',0,'credit',-fee)); END IF;
 ELSE
  lines:=jsonb_build_array(jsonb_build_object('account',_bank_account,'debit',0,'credit',-t.amount),
   jsonb_build_object('account',_counter_account,'debit',CASE WHEN abs(diff)<=0.02 THEN sumbal ELSE gross END,'credit',0));
  IF diff<>0 AND abs(diff)<=0.02 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account','653000','debit',greatest(diff,0),'credit',greatest(-diff,0))); END IF;
 END IF;
 INSERT INTO public.ponto_reconciliations(transaction_key,invoice_id,amount,payment_ref,paid_at) VALUES(key,NULL,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
 -- Facturen afletteren (volledig, of gedeeltelijk bij één factuur).
 FOREACH inv IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(_invoices) x) LOOP
  SELECT * INTO f FROM public.fin_invoices WHERE id=inv;
  SELECT coalesce(sum(ex_vat+vat),0) INTO total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
  local:=NULL;
  IF f.direction='verkoop' AND is_riory THEN
   SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND (('wb-'||id::text)=f.source_ref OR regexp_replace(upper(number),'\s','','g')=regexp_replace(upper(f.number),'\s','','g')) ORDER BY CASE WHEN ('wb-'||id::text)=f.source_ref THEN 0 ELSE 1 END LIMIT 1;
  END IF;
  IF n=1 AND abs(diff)>0.02 THEN bal:=gross; ELSE bal:=CASE WHEN local.id IS NOT NULL THEN round(local.total-local.paid_amount,2) ELSE round(total-f.paid_amount,2) END; END IF;
  IF local.id IS NOT NULL THEN
   UPDATE public.invoices SET paid_amount=round(paid_amount+bal,2), paid_at=CASE WHEN round(paid_amount+bal,2)>=total-0.005 THEN t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels' ELSE paid_at END WHERE id=local.id;
   IF n=1 THEN UPDATE public.ponto_reconciliations SET invoice_id=local.id WHERE transaction_key=key; END IF;
  END IF;
  UPDATE public.fin_invoices SET paid_amount=round(f.paid_amount+bal,2), status=CASE WHEN round(f.paid_amount+bal,2)>=total-0.005 THEN 'betaald' ELSE 'open' END,
   paid_at=CASE WHEN round(f.paid_amount+bal,2)>=total-0.005 THEN t.tx_date ELSE NULL END, bank_ref=key WHERE id=f.id;
  first_inv:=coalesce(first_inv,f.id); nrs:=nrs||CASE WHEN nrs='' THEN '' ELSE ', ' END||coalesce(f.number,''); IF names='' THEN names:=coalesce(f.counterparty,''); END IF;
 END LOOP;
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Betaling '||names||' '||nrs,left(nrs,200),'bank',t.id::text,lines);
 UPDATE public.fin_bank_tx SET entry_id=entry,matched_invoice_id=first_inv WHERE id=t.id;
 RETURN jsonb_build_object('invoices',n,'entryId',entry,'rounding',CASE WHEN abs(diff)<=0.02 THEN diff ELSE 0 END);
END $function$;
REVOKE ALL ON FUNCTION public.fin_reconcile_bank_multi(uuid,uuid[],text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_reconcile_bank_multi(uuid,uuid[],text,text,numeric) TO authenticated, service_role;