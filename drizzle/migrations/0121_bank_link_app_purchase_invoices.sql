ALTER TABLE public.fin_bank_tx ADD COLUMN matched_purchase_invoice_id uuid REFERENCES public.purchase_invoices(id);
CREATE OR REPLACE FUNCTION public.fin_link_purchase_bank(_transaction uuid,_purchase uuid,_mode text DEFAULT 'payment') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.fin_bank_tx; p public.purchase_invoices; uid uuid:=auth.uid(); paid numeric; next_paid numeric; result jsonb; key_value text; entry uuid; lines jsonb;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=t.company_id AND lower(trim(name))='riory bv') THEN RAISE EXCEPTION 'Aankoopfacturen uit deze app horen bij Riory BV'; END IF;
 IF t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL OR t.matched_purchase_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al gekoppeld'; END IF;
 SELECT * INTO p FROM public.purchase_invoices WHERE id=_purchase FOR UPDATE;
 IF NOT FOUND OR p.kind<>'factuur' OR p.total<=0 THEN RAISE EXCEPTION 'Kies een aankoopfactuur, geen creditnota'; END IF;
 IF p.status NOT IN ('goedgekeurd','betaling_klaargezet','betaald') THEN RAISE EXCEPTION 'Controleer en keur de aankoopfactuur eerst goed'; END IF;
 SELECT coalesce(sum(-amount),0) INTO paid FROM public.ponto_reconciliations WHERE purchase_invoice_id=p.id;
 IF paid=0 AND p.status='betaald' THEN paid:=p.total; END IF;
 IF _mode IN ('overpayment','refund') THEN result:=public.fin_manual_bank_amounts('aankoop',p.total,paid,t.amount,_mode); next_paid:=(result->>'paidAmount')::numeric;
 ELSIF _mode='payment' THEN
  IF t.amount>=0 THEN RAISE EXCEPTION 'Betalingsrichting past niet bij de aankoopfactuur'; END IF;
  IF p.status='betaald' THEN
   IF EXISTS(SELECT 1 FROM public.ponto_reconciliations WHERE purchase_invoice_id=p.id) OR abs(-t.amount-p.total)>0.005 THEN RAISE EXCEPTION 'Deze factuur is al betaald'; END IF;
   next_paid:=p.total;
  ELSE
   next_paid:=round(paid-t.amount,2);
   IF next_paid>p.total THEN RAISE EXCEPTION 'Bevestig het teveel betaalde bedrag afzonderlijk'; END IF;
  END IF;
  result:=jsonb_build_object('paidAmount',next_paid,'remaining',greatest(p.total-next_paid,0),'overpaid',greatest(next_paid-p.total,0));
 ELSE RAISE EXCEPTION 'Ongeldige betaalactie'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=t.bank_account AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number='440000' AND active) THEN RAISE EXCEPTION 'Actieve bankrekening of rekening 440000 ontbreekt'; END IF;
 key_value:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 INSERT INTO public.ponto_reconciliations(transaction_key,purchase_invoice_id,amount,payment_ref,paid_at) VALUES(key_value,p.id,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
 lines:=jsonb_build_array(jsonb_build_object('account',t.bank_account,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0)),jsonb_build_object('account','440000','debit',greatest(-t.amount,0),'credit',greatest(t.amount,0)));
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,CASE WHEN _mode='refund' THEN 'Terugstorting aankoop ' ELSE 'Betaling aankoop ' END||coalesce(p.supplier_name,'')||' '||coalesce(p.invoice_number,''),p.invoice_number,'bank',t.id::text,lines);
 UPDATE public.fin_bank_tx SET matched_purchase_invoice_id=p.id,entry_id=entry WHERE id=t.id;
 UPDATE public.purchase_invoices SET status=CASE WHEN next_paid>=total THEN 'betaald' ELSE 'goedgekeurd' END,paid_at=CASE WHEN next_paid>=total THEN coalesce(paid_at,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ELSE NULL END,bank_transaction_key=key_value,bank_payment_ref=t.description WHERE id=p.id;
 RETURN result||jsonb_build_object('entryId',entry);
END $$;
REVOKE ALL ON FUNCTION public.fin_link_purchase_bank(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_link_purchase_bank(uuid,uuid,text) TO authenticated,service_role;