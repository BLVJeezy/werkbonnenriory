CREATE OR REPLACE FUNCTION public.fin_undo_invoice_bank(_transaction uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_variable
DECLARE t public.fin_bank_tx; f public.fin_invoices; claim public.ponto_reconciliations; uid uuid:=auth.uid(); key text; fee numeric:=0; amount numeric; total numeric; paid numeric; local public.invoices;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.matched_invoice_id IS NULL THEN RAISE EXCEPTION 'Deze verrichting is niet aan een factuur gekoppeld'; END IF;
 IF EXISTS(SELECT 1 FROM public.fin_bank_allocations WHERE transaction_id=t.id) THEN RAISE EXCEPTION 'Verdeelde betaling: gebruik het terugdraaien van de verdeling'; END IF;
 SELECT * INTO f FROM public.fin_invoices WHERE id=t.matched_invoice_id AND company_id=t.company_id FOR UPDATE;
 IF t.entry_id IS NOT NULL THEN SELECT coalesce(sum(debit),0) INTO fee FROM public.fin_journal_lines WHERE entry_id=t.entry_id AND account='653000'; END IF;
 amount:=round(abs(t.amount)+fee,2);
 key:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 SELECT * INTO claim FROM public.ponto_reconciliations WHERE transaction_key=key FOR UPDATE;
 IF FOUND THEN
  IF claim.invoice_id IS NOT NULL THEN
   SELECT * INTO local FROM public.invoices WHERE id=claim.invoice_id FOR UPDATE;
   IF local.id IS NOT NULL THEN UPDATE public.invoices SET paid_amount=greatest(0,round(paid_amount-amount,2)),paid_at=CASE WHEN round(paid_amount-amount,2)>=total-0.005 THEN paid_at ELSE NULL END WHERE id=local.id; END IF;
  END IF;
  IF claim.purchase_invoice_id IS NULL THEN DELETE FROM public.ponto_reconciliations WHERE transaction_key=key; END IF;
 END IF;
 UPDATE public.fin_bank_tx SET entry_id=NULL, matched_invoice_id=NULL WHERE id=t.id;
 IF t.entry_id IS NOT NULL THEN
  DELETE FROM public.fin_journal_lines WHERE entry_id=t.entry_id;
  DELETE FROM public.fin_journal_entries WHERE id=t.entry_id AND company_id=t.company_id;
 END IF;
 IF f.id IS NOT NULL THEN
  SELECT coalesce(sum(ex_vat+vat),0) INTO total FROM public.fin_invoice_lines WHERE invoice_id=f.id;
  paid:=greatest(0,round(f.paid_amount-amount,2));
  UPDATE public.fin_invoices SET paid_amount=paid,
    status=CASE WHEN paid>=total-0.005 AND total>0 THEN 'betaald' ELSE 'open' END,
    paid_at=CASE WHEN paid>=total-0.005 AND total>0 THEN paid_at ELSE NULL END,
    bank_ref=CASE WHEN bank_ref IN (key, t.id::text) THEN NULL ELSE bank_ref END
  WHERE id=f.id;
 END IF;
 INSERT INTO public.fin_audit(company_id,user_id,entity,entity_id,action,detail) VALUES(t.company_id,uid,'bankverrichting',t.id,'koppeling_ongedaan',jsonb_build_object('factuur',f.id,'bedrag',amount));
 RETURN jsonb_build_object('invoice',f.id,'paidAmount',paid);
END $$;
REVOKE ALL ON FUNCTION public.fin_undo_invoice_bank(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_undo_invoice_bank(uuid) TO authenticated;