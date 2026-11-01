CREATE OR REPLACE FUNCTION public.delete_unsent_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  s public.settings%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Alleen de beheerder mag facturen verwijderen'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factuur niet gevonden'; END IF;
  IF inv.status = 'verzonden' OR inv.pdf_sent_at IS NOT NULL OR inv.okioki_sent_at IS NOT NULL OR inv.post_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Deze factuur is al verzonden en kan niet meer verwijderd worden';
  END IF;
  IF COALESCE(inv.paid_amount, 0) <> 0 THEN RAISE EXCEPTION 'Deze factuur heeft al een betaling; verwijder eerst de betaling'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE credit_for = _invoice_id) THEN RAISE EXCEPTION 'Er bestaat een creditnota op deze factuur'; END IF;
  IF EXISTS (SELECT 1 FROM public.ponto_reconciliations WHERE invoice_id = _invoice_id) THEN RAISE EXCEPTION 'Deze factuur is gekoppeld aan een bankverrichting'; END IF;
  UPDATE public.contract_billing_queue SET invoice_id = NULL, status = 'geannuleerd', error = 'Factuur verwijderd door beheerder' WHERE invoice_id = _invoice_id;
  DELETE FROM public.invoices WHERE id = _invoice_id;
  -- Geen gat in de nummering: was dit de laatst uitgegeven factuur, dan wordt het nummer opnieuw gebruikt.
  SELECT * INTO s FROM public.settings WHERE id = 1 FOR UPDATE;
  IF FOUND AND s.next_invoice_number > 1 AND inv.number = s.invoice_prefix || (s.next_invoice_number - 1)::text THEN
    UPDATE public.settings SET next_invoice_number = next_invoice_number - 1 WHERE id = 1;
  END IF;
END $$;