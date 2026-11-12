ALTER TABLE public.fin_bank_allocations ADD COLUMN IF NOT EXISTS mode text;
COMMENT ON COLUMN public.fin_bank_allocations.mode IS 'finance|purchase|paid; NULL = legacy row (finance or purchase by id column)';

DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.fin_split_bank_payment(uuid,jsonb)'::regprocedure) INTO d;
 d := replace(d, 'INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,purchase_invoice_id,amount) VALUES(t.id,t.company_id,uid,p.id,part)', 'INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,purchase_invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,p.id,part,''purchase'')');
 d := replace(d, 'INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount) VALUES(t.id,t.company_id,uid,f.id,part) ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;
   UPDATE public.fin_invoices SET paid_amount=paid+part', 'INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,part,''finance'') ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;
   UPDATE public.fin_invoices SET paid_amount=paid+part');
 d := replace(d, 'INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount) VALUES(t.id,t.company_id,uid,f.id,part) ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;
   UPDATE public.fin_invoices SET bank_ref=coalesce', 'INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,part,''paid'') ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;
   UPDATE public.fin_invoices SET bank_ref=coalesce');
 IF (length(d) - length(replace(d, ',mode)', ''))) / 6 <> 3 THEN RAISE EXCEPTION 'split function layout changed'; END IF;
 EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public.fin_undo_bank_allocations(_transaction uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.fin_bank_tx; a public.fin_bank_allocations; f public.fin_invoices; local public.invoices; uid uuid:=auth.uid(); key_value text; tot numeric; n int:=0; m text;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 key_value:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 FOR a IN SELECT * FROM public.fin_bank_allocations WHERE transaction_id=t.id FOR UPDATE LOOP
  m:=coalesce(a.mode, CASE WHEN a.purchase_invoice_id IS NOT NULL THEN 'purchase' ELSE 'finance' END);
  IF m='purchase' THEN
   UPDATE public.purchase_invoices SET status='goedgekeurd',paid_at=NULL,bank_transaction_key=NULL,bank_payment_ref=NULL WHERE id=a.purchase_invoice_id AND status='betaald' OR (id=a.purchase_invoice_id AND bank_transaction_key=key_value);
  ELSE
   SELECT * INTO f FROM public.fin_invoices WHERE id=a.invoice_id FOR UPDATE;
   IF m='finance' AND f.id IS NOT NULL THEN
    SELECT coalesce(sum(ex_vat+vat),0) INTO tot FROM public.fin_invoice_lines WHERE invoice_id=f.id;
    UPDATE public.fin_invoices SET paid_amount=greatest(0,round(paid_amount-a.amount,2)),status=CASE WHEN round(paid_amount-a.amount,2)>=tot-0.005 THEN 'betaald' ELSE 'open' END,paid_at=CASE WHEN round(paid_amount-a.amount,2)>=tot-0.005 THEN paid_at ELSE NULL END,bank_ref=CASE WHEN bank_ref=key_value THEN NULL ELSE bank_ref END WHERE id=f.id;
    SELECT * INTO local FROM public.invoices WHERE kind='factuur' AND (('wb-'||id::text)=f.source_ref OR number=f.number) ORDER BY CASE WHEN ('wb-'||id::text)=f.source_ref THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE;
    IF local.id IS NOT NULL THEN UPDATE public.invoices SET paid_amount=greatest(0,round(paid_amount-a.amount,2)),paid_at=CASE WHEN round(paid_amount-a.amount,2)>=total-0.005 THEN paid_at ELSE NULL END WHERE id=local.id; END IF;
   ELSIF f.id IS NOT NULL THEN
    UPDATE public.fin_invoices SET bank_ref=CASE WHEN bank_ref=key_value THEN NULL ELSE bank_ref END WHERE id=f.id;
   END IF;
  END IF;
  n:=n+1;
 END LOOP;
 IF n=0 THEN RAISE EXCEPTION 'Deze verrichting heeft geen verdeelde betaling'; END IF;
 UPDATE public.fin_bank_tx SET entry_id=NULL WHERE id=t.id;
 DELETE FROM public.fin_bank_allocations WHERE transaction_id=t.id;
 ALTER TABLE public.fin_journal_entries DISABLE TRIGGER protect_bank_part_delete;
 DELETE FROM public.fin_journal_lines WHERE entry_id IN (SELECT id FROM public.fin_journal_entries WHERE company_id=t.company_id AND source='bank-part' AND (source_ref=t.id::text OR source_ref LIKE t.id::text||':%'));
 DELETE FROM public.fin_journal_entries WHERE company_id=t.company_id AND source='bank-part' AND (source_ref=t.id::text OR source_ref LIKE t.id::text||':%');
 ALTER TABLE public.fin_journal_entries ENABLE TRIGGER protect_bank_part_delete;
 DELETE FROM public.ponto_reconciliations WHERE transaction_key=key_value AND invoice_id IS NULL AND purchase_invoice_id IS NULL;
 INSERT INTO public.fin_audit(company_id,user_id,entity,entity_id,action,detail) VALUES(t.company_id,uid,'bankverrichting',t.id,'verdeling_ongedaan',jsonb_build_object('facturen',n));
 RETURN jsonb_build_object('invoices',n);
END $$;
REVOKE ALL ON FUNCTION public.fin_undo_bank_allocations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_undo_bank_allocations(uuid) TO authenticated;