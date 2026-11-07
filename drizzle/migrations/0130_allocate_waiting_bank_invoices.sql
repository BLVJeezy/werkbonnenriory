CREATE OR REPLACE FUNCTION public.fin_allocate_waiting_bank(_transaction uuid, _allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE t public.fin_bank_tx; original_entry uuid; result jsonb; new_entry uuid; remaining_amount numeric; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND OR t.entry_id IS NULL OR t.matched_invoice_id IS NOT NULL OR t.matched_purchase_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Kies een betaling op de wachtrekening'; END IF;
 original_entry:=t.entry_id;
 PERFORM 1 FROM public.fin_journal_entries WHERE id=original_entry AND company_id=t.company_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR (SELECT count(*) FROM public.fin_journal_lines WHERE entry_id=original_entry)<>2
 OR NOT EXISTS(SELECT 1 FROM public.fin_journal_lines WHERE entry_id=original_entry AND account='499000' AND debit=greatest(-t.amount,0) AND credit=greatest(t.amount,0))
 OR NOT EXISTS(SELECT 1 FROM public.fin_journal_lines WHERE entry_id=original_entry AND account=t.bank_account AND debit=greatest(t.amount,0) AND credit=greatest(-t.amount,0))
 OR EXISTS(SELECT 1 FROM public.fin_journal_entries WHERE company_id=t.company_id AND source='wacht' AND source_ref=t.id::text)
 THEN RAISE EXCEPTION 'De wachtrekeningboeking wijkt af of is al doorgeboekt'; END IF;
 SELECT round(abs(t.amount)-coalesce(sum(amount),0),2) INTO remaining_amount FROM public.fin_bank_allocations WHERE transaction_id=t.id;
 IF remaining_amount<=0 THEN RAISE EXCEPTION 'Deze betaling is volledig afgeletterd'; END IF;
 UPDATE public.fin_bank_tx SET entry_id=NULL WHERE id=t.id;
 result:=public.fin_split_bank_payment(t.id,_allocations);
 new_entry:=(result->>'entryId')::uuid;
 -- Reclassify only the newly allocated part; the original bank leg is untouched.
 UPDATE public.fin_journal_lines SET account='499000' WHERE entry_id=new_entry AND account=t.bank_account;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tegenboeking ontbreekt'; END IF;
 UPDATE public.fin_journal_entries SET journal='divers',source='wacht-part',description='Aflettering uit wachtrekening · '||description WHERE id=new_entry;
 UPDATE public.fin_bank_tx SET entry_id=original_entry WHERE id=t.id;
 INSERT INTO public.fin_audit(user_id,company_id,entity,entity_id,action,detail) VALUES(uid,t.company_id,'bank',t.id,'wachtrekening_afgeletterd',jsonb_build_object('originalEntry',original_entry,'allocationEntry',new_entry,'remaining',result->'bankRemaining'));
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.fin_allocate_waiting_bank(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_allocate_waiting_bank(uuid,jsonb) TO authenticated,service_role;