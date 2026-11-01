CREATE OR REPLACE FUNCTION public.fin_settle_paid_invoice(_transaction uuid, _invoice uuid, _bank_account text, _counter_account text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.fin_bank_tx; f public.fin_invoices; total numeric; key text; entry uuid; uid uuid:=auth.uid();
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
 IF abs(abs(t.amount)-total)>0.025 THEN RAISE EXCEPTION 'Bedrag verschilt van het factuurbedrag'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_bank_account AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=_counter_account AND active) THEN RAISE EXCEPTION 'Kies bestaande actieve grootboekrekeningen'; END IF;
 key:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 -- Claim the transaction so Ponto cannot register it again; the paid amount itself stays unchanged.
 INSERT INTO public.ponto_reconciliations(transaction_key,amount,payment_ref,paid_at) VALUES(key,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Betaling '||coalesce(f.counterparty,'')||' '||coalesce(f.number,''),f.number,'bank',t.id::text,jsonb_build_array(jsonb_build_object('account',_bank_account,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0)),jsonb_build_object('account',_counter_account,'debit',greatest(-t.amount,0),'credit',greatest(t.amount,0))));
 UPDATE public.fin_bank_tx SET entry_id=entry,matched_invoice_id=f.id WHERE id=t.id;
 UPDATE public.fin_invoices SET bank_ref=coalesce(bank_ref,key) WHERE id=f.id;
 RETURN entry;
END $$;
REVOKE ALL ON FUNCTION public.fin_settle_paid_invoice(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_settle_paid_invoice(uuid,uuid,text,text) TO authenticated;