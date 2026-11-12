CREATE OR REPLACE FUNCTION public.fin_undo_purchase_bank(_transaction uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.fin_bank_tx; p public.purchase_invoices; uid uuid:=auth.uid(); key_value text; paid numeric; removed int;
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO t FROM public.fin_bank_tx WHERE id=_transaction AND public.owns_company(company_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
 IF t.matched_purchase_invoice_id IS NULL THEN RAISE EXCEPTION 'Deze verrichting is niet aan een aankoopfactuur gekoppeld'; END IF;
 IF EXISTS(SELECT 1 FROM public.fin_bank_allocations WHERE transaction_id=t.id) THEN RAISE EXCEPTION 'Verdeelde betaling: gebruik het terugdraaien van de verdeling'; END IF;
 SELECT * INTO p FROM public.purchase_invoices WHERE id=t.matched_purchase_invoice_id FOR UPDATE;
 key_value:=CASE WHEN t.dedupe_key LIKE 'ponto:%' THEN substr(t.dedupe_key,7) ELSE 'finance:'||t.id::text END;
 DELETE FROM public.ponto_reconciliations WHERE purchase_invoice_id=t.matched_purchase_invoice_id AND transaction_key IN (key_value, t.dedupe_key, 'finance:'||t.id::text);
 GET DIAGNOSTICS removed = ROW_COUNT;
 UPDATE public.fin_bank_tx SET entry_id=NULL, matched_purchase_invoice_id=NULL WHERE id=t.id;
 IF t.entry_id IS NOT NULL THEN DELETE FROM public.fin_journal_entries WHERE id=t.entry_id AND company_id=t.company_id; END IF;
 IF FOUND OR p.id IS NOT NULL THEN
  SELECT coalesce(sum(-amount),0) INTO paid FROM public.ponto_reconciliations WHERE purchase_invoice_id=p.id;
  paid:=paid+coalesce(p.bank_paid_base,0)+coalesce((SELECT sum(amount) FROM public.fin_bank_allocations WHERE purchase_invoice_id=p.id),0);
  UPDATE public.purchase_invoices SET
    status=CASE WHEN paid>=total-0.005 THEN 'betaald' WHEN status='betaald' THEN 'goedgekeurd' ELSE status END,
    paid_at=CASE WHEN paid>=total-0.005 THEN paid_at ELSE NULL END,
    bank_transaction_key=CASE WHEN bank_transaction_key IN (key_value, t.dedupe_key) THEN NULL ELSE bank_transaction_key END,
    bank_payment_ref=CASE WHEN bank_transaction_key IN (key_value, t.dedupe_key) THEN NULL ELSE bank_payment_ref END
  WHERE id=p.id;
 END IF;
 INSERT INTO public.fin_audit(company_id,entity,entity_id,action,detail) VALUES(t.company_id,'boeking',coalesce(t.entry_id,t.id),'ongedaan_gemaakt',jsonb_build_object('aankoopfactuur',p.id,'verrichting',t.id,'claims',removed));
 RETURN jsonb_build_object('purchase',p.id,'claimsRemoved',removed);
END $$;
REVOKE ALL ON FUNCTION public.fin_undo_purchase_bank(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_undo_purchase_bank(uuid) TO authenticated;