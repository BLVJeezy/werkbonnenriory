CREATE OR REPLACE FUNCTION public.fin_split_bank_payment(_transaction uuid, _allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 t public.fin_bank_tx;
 p public.purchase_invoices;
 f public.fin_invoices;
 local public.invoices;
 uid uuid:=auth.uid();
 a jsonb;
 invoice_total numeric;
 paid numeric;
 part numeric;
 parts numeric:=0;
 parts_aankoop numeric:=0;
 parts_verkoop numeric:=0;
 allocated numeric:=0;
 direction_value text;
 counter_aankoop text;
 counter_verkoop text;
 entry uuid;
 key_value text;
 refs text:='';
 names text:='';
 is_riory boolean;
 card_part numeric:=0;
 wb_card numeric;
 is_card boolean;
 journal_lines jsonb;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF jsonb_typeof(_allocations) IS DISTINCT FROM 'array' OR jsonb_array_length(_allocations)<1 OR jsonb_array_length(_allocations)>50 THEN RAISE EXCEPTION 'Kies 1 tot 50 facturen'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.amount=0 OR t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL OR t.matched_purchase_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al verwerkt of heeft geen bedrag'; END IF;
 direction_value:=CASE WHEN t.amount<0 THEN 'aankoop' ELSE 'verkoop' END;
 counter_aankoop:=public.fin_active_control_account(t.company_id,'aankoop');
 counter_verkoop:=public.fin_active_control_account(t.company_id,'verkoop');
 is_riory:=EXISTS(SELECT 1 FROM public.companies WHERE id=t.company_id AND lower(trim(name))='riory bv');
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=t.bank_account AND active) THEN RAISE EXCEPTION 'Actieve bankrekening ontbreekt'; END IF;
 key_value:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 INSERT INTO public.ponto_reconciliations(transaction_key,amount,payment_ref,paid_at) VALUES(key_value,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.fin_bank_allocations WHERE transaction_id=t.id) THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
 SELECT coalesce(sum(amount),0) INTO allocated FROM public.fin_bank_allocations WHERE transaction_id=t.id;
 FOR a IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'id' LOOP
  part:=(a->>'amount')::numeric;
  IF part IS NULL OR part<=0 OR part<>round(part,2) THEN RAISE EXCEPTION 'Vul een positief bedrag met maximaal twee decimalen in'; END IF;
  parts:=parts+part;
  IF a->>'type'='purchase' THEN
   IF NOT is_riory OR direction_value<>'aankoop' THEN RAISE EXCEPTION 'Aankoopfacturen uit deze app horen bij Riory BV'; END IF;
   SELECT * INTO p FROM public.purchase_invoices WHERE id=(a->>'id')::uuid FOR UPDATE;
   IF NOT FOUND OR p.kind<>'factuur' OR p.status NOT IN ('goedgekeurd','betaling_klaargezet') THEN RAISE EXCEPTION 'Kies goedgekeurde, onbetaalde aankoopfacturen'; END IF;
   SELECT coalesce(sum(-amount),0)+p.bank_paid_base INTO paid FROM public.ponto_reconciliations WHERE purchase_invoice_id=p.id;
   paid:=paid+coalesce((SELECT sum(amount) FROM public.fin_bank_allocations WHERE purchase_invoice_id=p.id),0);
   IF part>round(p.total-paid,2) THEN RAISE EXCEPTION 'Bedrag overschrijdt saldo van aankoopfactuur %',p.invoice_number; END IF;
   INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,purchase_invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,p.id,part,'purchase') ON CONFLICT(transaction_id,purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;
   UPDATE public.purchase_invoices SET status=CASE WHEN paid+part>=total THEN 'betaald' ELSE 'goedgekeurd' END,paid_at=CASE WHEN paid+part>=total THEN t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels' ELSE NULL END,bank_transaction_key=key_value,bank_payment_ref=t.description WHERE id=p.id;
   parts_aankoop:=parts_aankoop+part;
   refs:=refs||CASE WHEN refs='' THEN '' ELSE ', ' END||coalesce(p.invoice_number,''); names:=names||CASE WHEN names='' THEN '' ELSE ', ' END||coalesce(p.supplier_name,'');
  ELSIF a->>'type'='finance' THEN
   SELECT * INTO f FROM public.fin_invoices WHERE id=(a->>'id')::uuid AND company_id=t.company_id AND user_id=uid FOR UPDATE;
   IF NOT FOUND OR f.doc_type NOT IN ('factuur','creditnota')
      OR (f.doc_type='factuur' AND f.direction<>direction_value)
      OR (f.doc_type='creditnota' AND f.direction=direction_value) THEN
    RAISE EXCEPTION 'Factuur of creditnota past niet bij deze verrichting';
   END IF;
   SELECT round(abs(coalesce(sum(ex_vat+vat),0)),2) INTO invoice_total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
   paid:=f.paid_amount; local:=NULL;
   IF f.doc_type='factuur' AND f.direction='verkoop' AND is_riory THEN
    SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND ('wb-'||id::text)=f.source_ref FOR UPDATE;
    IF NOT FOUND THEN
     IF (SELECT count(*) FROM public.invoices WHERE kind='factuur' AND number=f.number)>1 THEN RAISE EXCEPTION 'Factuurnummer is niet uniek'; END IF;
     SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND number=f.number FOR UPDATE;
    END IF;
    IF local.id IS NOT NULL THEN
     IF abs(local.total-invoice_total)>0.005 THEN RAISE EXCEPTION 'Factuurbedragen verschillen'; END IF;
     paid:=local.paid_amount;
    END IF;
   END IF;
   card_part:=0;
   is_card:=t.amount>0 AND (coalesce(t.counterparty,'')||' '||coalesce(t.description,'')) ~* '(ccv|europabank|worldline|bancontact|payconiq|sumup|viva wallet|mollie|bruto:)';
   IF is_card AND local.id IS NOT NULL THEN
    SELECT coalesce(sum(w.paid_amount),0) INTO wb_card FROM public.work_orders w WHERE (w.id=local.work_order_id OR w.id=ANY(coalesce(local.extra_work_order_ids,'{}'::uuid[]))) AND w.paid_at IS NOT NULL AND w.paid_method ~* '(bancontact|kaart|card|visa|master|maestro|payconiq)';
    wb_card:=wb_card-coalesce((SELECT sum(amount) FROM public.fin_bank_allocations WHERE invoice_id=f.id AND mode='paid'),0);
    card_part:=greatest(0,least(part,round(wb_card,2)));
   END IF;
   IF part-card_part>round(invoice_total-paid,2)+0.005 THEN RAISE EXCEPTION 'Bedrag overschrijdt saldo van % %',CASE WHEN f.doc_type='creditnota' THEN 'creditnota' ELSE 'factuur' END,f.number; END IF;
   part:=part-card_part;
   IF card_part>0 THEN INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,card_part+part,CASE WHEN part>0 THEN 'finance' ELSE 'paid' END) ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount; END IF;
   IF card_part=0 THEN INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,part,'finance') ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;
   END IF;
   UPDATE public.fin_invoices SET paid_amount=round(paid+part,2),status=CASE WHEN round(paid+part,2)>=invoice_total-0.005 THEN 'betaald' ELSE 'open' END,paid_at=CASE WHEN round(paid+part,2)>=invoice_total-0.005 THEN t.tx_date ELSE NULL END,bank_ref=key_value WHERE id=f.id;
   IF local.id IS NOT NULL THEN UPDATE public.invoices SET paid_amount=round(paid+part,2),paid_at=CASE WHEN round(paid+part,2)>=invoice_total-0.005 THEN t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels' ELSE paid_at END WHERE id=local.id; END IF;
   part:=part+card_part;
   IF f.direction='aankoop' THEN parts_aankoop:=parts_aankoop+part; ELSE parts_verkoop:=parts_verkoop+part; END IF;
   refs:=refs||CASE WHEN refs='' THEN '' ELSE ', ' END||coalesce(f.number,''); names:=names||CASE WHEN names='' THEN '' ELSE ', ' END||coalesce(f.counterparty,'');
  ELSIF a->>'type'='paid' THEN
   SELECT * INTO f FROM public.fin_invoices WHERE id=(a->>'id')::uuid AND company_id=t.company_id AND user_id=uid FOR UPDATE;
   IF NOT FOUND OR f.doc_type<>'factuur' OR f.direction<>direction_value OR f.status<>'betaald' THEN RAISE EXCEPTION 'Kies een betaald gemarkeerde factuur die bij deze verrichting past'; END IF;
   IF EXISTS(SELECT 1 FROM public.fin_bank_tx WHERE matched_invoice_id=f.id) THEN RAISE EXCEPTION 'Factuur % heeft al een betaling',f.number; END IF;
   SELECT coalesce(sum(ex_vat+vat),0) INTO invoice_total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
   SELECT coalesce(sum(amount),0) INTO paid FROM public.fin_bank_allocations WHERE invoice_id=f.id;
   IF part>round(invoice_total-paid,2) THEN RAISE EXCEPTION 'Bedrag overschrijdt het nog niet afgeletterde deel van factuur %',f.number; END IF;
   INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,part,'paid') ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;
   UPDATE public.fin_invoices SET bank_ref=coalesce(bank_ref,key_value) WHERE id=f.id;
   IF f.direction='aankoop' THEN parts_aankoop:=parts_aankoop+part; ELSE parts_verkoop:=parts_verkoop+part; END IF;
   refs:=refs||CASE WHEN refs='' THEN '' ELSE ', ' END||coalesce(f.number,''); names:=names||CASE WHEN names='' THEN '' ELSE ', ' END||coalesce(f.counterparty,'');
  ELSE RAISE EXCEPTION 'Ongeldig factuurtype'; END IF;
 END LOOP;
 IF round(parts+allocated,2)>round(abs(t.amount),2) THEN RAISE EXCEPTION 'De verdeling overschrijdt het nog openstaande bankbedrag'; END IF;
 IF parts_aankoop>0 AND NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=counter_aankoop AND active) THEN RAISE EXCEPTION 'Actieve leveranciersrekening ontbreekt'; END IF;
 IF parts_verkoop>0 AND NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=counter_verkoop AND active) THEN RAISE EXCEPTION 'Actieve klantenrekening ontbreekt'; END IF;
 journal_lines:=jsonb_build_array(jsonb_build_object('account',t.bank_account,'debit',CASE WHEN t.amount>0 THEN parts ELSE 0 END,'credit',CASE WHEN t.amount<0 THEN parts ELSE 0 END));
 IF parts_aankoop>0 THEN
  journal_lines:=journal_lines||jsonb_build_array(jsonb_build_object('account',counter_aankoop,'debit',CASE WHEN t.amount<0 THEN parts_aankoop ELSE 0 END,'credit',CASE WHEN t.amount>0 THEN parts_aankoop ELSE 0 END));
 END IF;
 IF parts_verkoop>0 THEN
  journal_lines:=journal_lines||jsonb_build_array(jsonb_build_object('account',counter_verkoop,'debit',CASE WHEN t.amount<0 THEN parts_verkoop ELSE 0 END,'credit',CASE WHEN t.amount>0 THEN parts_verkoop ELSE 0 END));
 END IF;
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Verdeelde betaling '||names,refs,'bank-part',public.fin_bank_part_reference(t.id,allocated,parts),journal_lines);
 UPDATE public.fin_bank_allocations SET entry_id=entry WHERE transaction_id=t.id AND ((invoice_id::text IN (SELECT value->>'id' FROM jsonb_array_elements(_allocations))) OR (purchase_invoice_id::text IN (SELECT value->>'id' FROM jsonb_array_elements(_allocations))));
 UPDATE public.fin_bank_tx SET entry_id=CASE WHEN round(parts+allocated,2)=round(abs(t.amount),2) THEN entry ELSE NULL END WHERE id=t.id;
 RETURN jsonb_build_object('entryId',entry,'invoices',jsonb_array_length(_allocations),'bankRemaining',round(abs(t.amount)-parts-allocated,2));
END $function$;