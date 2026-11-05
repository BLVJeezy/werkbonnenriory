CREATE TABLE public.fin_bank_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id uuid NOT NULL REFERENCES public.fin_bank_tx(id),company_id uuid NOT NULL REFERENCES public.companies(id),user_id uuid NOT NULL,invoice_id uuid REFERENCES public.fin_invoices(id),purchase_invoice_id uuid REFERENCES public.purchase_invoices(id),amount numeric NOT NULL CHECK(amount>0),CHECK((invoice_id IS NULL)<>(purchase_invoice_id IS NULL)));
GRANT SELECT ON public.fin_bank_allocations TO authenticated; GRANT ALL ON public.fin_bank_allocations TO service_role;
ALTER TABLE public.fin_bank_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY allocation_owner ON public.fin_bank_allocations FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.owns_company(company_id));
CREATE UNIQUE INDEX allocation_fin_unique ON public.fin_bank_allocations(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL;
CREATE UNIQUE INDEX allocation_purchase_unique ON public.fin_bank_allocations(transaction_id,purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.fin_split_bank_payment(_transaction uuid,_allocations jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.fin_bank_tx; p public.purchase_invoices; f public.fin_invoices; local public.invoices; uid uuid:=auth.uid(); a jsonb; invoice_total numeric; paid numeric; part numeric; parts numeric:=0; direction_value text; counter_value text; entry uuid; key_value text; refs text:=''; names text:=''; is_riory boolean;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF jsonb_typeof(_allocations) IS DISTINCT FROM 'array' OR jsonb_array_length(_allocations)<2 OR jsonb_array_length(_allocations)>50 THEN RAISE EXCEPTION 'Kies 2 tot 50 facturen'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND user_id=uid AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.amount=0 OR t.entry_id IS NOT NULL OR t.matched_invoice_id IS NOT NULL OR t.matched_purchase_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Deze verrichting is al verwerkt of heeft geen bedrag'; END IF;
 direction_value:=CASE WHEN t.amount<0 THEN 'aankoop' ELSE 'verkoop' END; counter_value:=CASE WHEN t.amount<0 THEN '440000' ELSE '400000' END;
 is_riory:=EXISTS(SELECT 1 FROM public.companies WHERE id=t.company_id AND lower(trim(name))='riory bv');
 IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=t.bank_account AND active) OR NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=counter_value AND active) THEN RAISE EXCEPTION 'Actieve bank- of tegenrekening ontbreekt'; END IF;
 key_value:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 INSERT INTO public.ponto_reconciliations(transaction_key,amount,payment_ref,paid_at) VALUES(key_value,t.amount,t.description,t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deze verrichting is al gebruikt'; END IF;
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
   INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,purchase_invoice_id,amount) VALUES(t.id,t.company_id,uid,p.id,part);
   UPDATE public.purchase_invoices SET status=CASE WHEN paid+part>=total THEN 'betaald' ELSE 'goedgekeurd' END,paid_at=CASE WHEN paid+part>=total THEN t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels' ELSE NULL END,bank_transaction_key=key_value,bank_payment_ref=t.description WHERE id=p.id;
   refs:=refs||CASE WHEN refs='' THEN '' ELSE ', ' END||coalesce(p.invoice_number,''); names:=names||CASE WHEN names='' THEN '' ELSE ', ' END||coalesce(p.supplier_name,'');
  ELSIF a->>'type'='finance' THEN
   SELECT * INTO f FROM public.fin_invoices WHERE id=(a->>'id')::uuid AND company_id=t.company_id AND user_id=uid FOR UPDATE;
   IF NOT FOUND OR f.doc_type<>'factuur' OR f.direction<>direction_value THEN RAISE EXCEPTION 'Factuur past niet bij deze verrichting'; END IF;
   SELECT coalesce(sum(ex_vat+vat),0) INTO invoice_total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
   paid:=f.paid_amount; local:=NULL;
   IF f.direction='verkoop' AND is_riory THEN
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
   IF part>round(invoice_total-paid,2) THEN RAISE EXCEPTION 'Bedrag overschrijdt saldo van factuur %',f.number; END IF;
   INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount) VALUES(t.id,t.company_id,uid,f.id,part);
   UPDATE public.fin_invoices SET paid_amount=paid+part,status=CASE WHEN paid+part>=invoice_total THEN 'betaald' ELSE 'open' END,paid_at=CASE WHEN paid+part>=invoice_total THEN t.tx_date ELSE NULL END,bank_ref=key_value WHERE id=f.id;
   IF local.id IS NOT NULL THEN UPDATE public.invoices SET paid_amount=paid+part,paid_at=CASE WHEN paid+part>=invoice_total THEN t.tx_date::timestamp AT TIME ZONE 'Europe/Brussels' ELSE paid_at END WHERE id=local.id; END IF;
   refs:=refs||CASE WHEN refs='' THEN '' ELSE ', ' END||coalesce(f.number,''); names:=names||CASE WHEN names='' THEN '' ELSE ', ' END||coalesce(f.counterparty,'');
  ELSE RAISE EXCEPTION 'Ongeldig factuurtype'; END IF;
 END LOOP;
 IF round(parts,2)<>round(abs(t.amount),2) THEN RAISE EXCEPTION 'De verdeling (%) moet gelijk zijn aan de betaling (%)',parts,abs(t.amount); END IF;
 entry:=public.fin_post_entry(t.company_id,'bank',t.tx_date,'Verdeelde betaling '||names,refs,'bank',t.id::text,jsonb_build_array(jsonb_build_object('account',t.bank_account,'debit',greatest(t.amount,0),'credit',greatest(-t.amount,0)),jsonb_build_object('account',counter_value,'debit',greatest(-t.amount,0),'credit',greatest(t.amount,0))));
 UPDATE public.fin_bank_tx SET entry_id=entry WHERE id=t.id;
 RETURN jsonb_build_object('entryId',entry,'invoices',jsonb_array_length(_allocations));
END $$;
REVOKE ALL ON FUNCTION public.fin_split_bank_payment(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_split_bank_payment(uuid,jsonb) TO authenticated,service_role;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='fin_link_purchase_bank';
 def:=replace(def,'paid:=paid+p.bank_paid_base;', 'paid:=paid+p.bank_paid_base+coalesce((SELECT sum(amount) FROM public.fin_bank_allocations WHERE purchase_invoice_id=p.id),0);');
 EXECUTE def;
END $$;