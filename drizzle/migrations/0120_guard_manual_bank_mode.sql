CREATE OR REPLACE FUNCTION public.fin_manual_bank_amounts(_direction text, _total numeric, _paid numeric, _amount numeric, _mode text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE delta numeric; next_paid numeric; excess numeric;
BEGIN
 IF _direction IS NULL OR _total IS NULL OR _paid IS NULL OR _amount IS NULL OR _mode IS NULL OR _direction NOT IN ('aankoop','verkoop') OR _total<=0 OR _paid<0 OR _amount=0 OR _mode NOT IN ('overpayment','refund') THEN RAISE EXCEPTION 'Ongeldige factuur of verrichting'; END IF;
 delta:=round(_amount * CASE WHEN _direction='verkoop' THEN 1 ELSE -1 END,2);
 excess:=greatest(round(_paid-_total,2),0);
 IF _mode='refund' THEN
  IF delta>=0 THEN RAISE EXCEPTION 'Kies een terugstorting in de tegenovergestelde betalingsrichting'; END IF;
  IF excess<=0 THEN RAISE EXCEPTION 'Geen geregistreerd teveel betaald bedrag. Koppel eerst de oorspronkelijke betaling.'; END IF;
  IF -delta>excess THEN RAISE EXCEPTION 'Terugstorting is hoger dan het teveel betaalde bedrag (%)',excess; END IF;
 ELSE
  IF delta<=0 OR _paid+delta<=_total THEN RAISE EXCEPTION 'Kies een betaling die het factuurbedrag overschrijdt'; END IF;
 END IF;
 next_paid:=round(_paid+delta,2);
 RETURN jsonb_build_object('paidAmount',next_paid,'remaining',greatest(_total-next_paid,0),'overpaid',greatest(next_paid-_total,0));
END $$;