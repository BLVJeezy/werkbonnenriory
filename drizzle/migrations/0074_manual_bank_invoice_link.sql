CREATE OR REPLACE FUNCTION public.link_bank_transaction(p_transaction_key text, p_invoice_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE tx public.ponto_transactions; inv public.invoices; balance numeric; paid numeric; payment_date timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
  SELECT * INTO tx FROM public.ponto_transactions WHERE transaction_key=p_transaction_key FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verrichting niet gevonden'; END IF;
  IF tx.amount <= 0 THEN RAISE EXCEPTION 'Kies een inkomende betaling voor een verkoopfactuur'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.kind <> 'factuur' THEN RAISE EXCEPTION 'Factuur niet gevonden'; END IF;
  balance := round(inv.total - coalesce(inv.paid_amount,0), 2);
  IF balance <= 0 THEN RAISE EXCEPTION 'Deze factuur is al volledig betaald'; END IF;
  IF tx.amount > balance THEN RAISE EXCEPTION 'Het bedrag is hoger dan het openstaande saldo'; END IF;
  payment_date := coalesce(tx.execution_date::timestamp AT TIME ZONE 'Europe/Brussels', now());
  INSERT INTO public.ponto_reconciliations(transaction_key,invoice_id,amount,payment_ref,paid_at)
    VALUES(tx.transaction_key,inv.id,tx.amount,tx.remittance,payment_date) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deze verrichting is al gekoppeld'; END IF;
  paid := round(coalesce(inv.paid_amount,0)+tx.amount,2);
  UPDATE public.invoices SET paid_amount=paid, paid_at=CASE WHEN paid>=inv.total THEN payment_date ELSE inv.paid_at END WHERE id=inv.id;
  RETURN paid;
END;
$$;
REVOKE ALL ON FUNCTION public.link_bank_transaction(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_bank_transaction(text,uuid) TO authenticated;