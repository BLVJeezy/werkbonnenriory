CREATE OR REPLACE FUNCTION public.fin_offset_credit_note(
  _credit uuid,
  _invoice uuid,
  _amount numeric,
  _date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit public.fin_invoices%ROWTYPE;
  v_invoice public.fin_invoices%ROWTYPE;
  v_credit_total numeric;
  v_invoice_total numeric;
  v_credit_open numeric;
  v_invoice_open numeric;
  v_amount numeric;
  v_new_credit_paid numeric;
  v_new_invoice_paid numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen beheerders mogen creditnota''s afpunten';
  END IF;

  IF _credit IS NULL OR _invoice IS NULL OR _credit = _invoice THEN
    RAISE EXCEPTION 'Kies een geldige creditnota en een andere factuur';
  END IF;

  IF NOT public.owns_fin_invoice(_credit) OR NOT public.owns_fin_invoice(_invoice) THEN
    RAISE EXCEPTION 'Geen toegang tot een van deze documenten';
  END IF;

  v_amount := round(coalesce(_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Bedrag moet groter zijn dan 0';
  END IF;

  -- Vergrendel in vaste ID-volgorde om deadlocks te voorkomen
  IF _credit < _invoice THEN
    SELECT * INTO v_credit FROM public.fin_invoices WHERE id = _credit FOR UPDATE;
    SELECT * INTO v_invoice FROM public.fin_invoices WHERE id = _invoice FOR UPDATE;
  ELSE
    SELECT * INTO v_invoice FROM public.fin_invoices WHERE id = _invoice FOR UPDATE;
    SELECT * INTO v_credit FROM public.fin_invoices WHERE id = _credit FOR UPDATE;
  END IF;

  IF v_credit.id IS NULL OR v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Document niet gevonden';
  END IF;

  IF v_credit.company_id <> v_invoice.company_id THEN
    RAISE EXCEPTION 'Creditnota en factuur horen niet bij hetzelfde bedrijf';
  END IF;

  IF v_credit.doc_type <> 'creditnota' THEN
    RAISE EXCEPTION 'Gekozen brondocument is geen creditnota';
  END IF;

  IF v_invoice.doc_type <> 'factuur' THEN
    RAISE EXCEPTION 'Kies een gewone factuur om mee af te punten';
  END IF;

  IF v_credit.direction <> v_invoice.direction THEN
    RAISE EXCEPTION 'Een verkoopcreditnota kan alleen met een verkoopfactuur worden afgepunt, en een aankoopcreditnota alleen met een aankoopfactuur';
  END IF;

  SELECT round(abs(coalesce(sum(ex_vat + vat), 0)), 2)
  INTO v_credit_total
  FROM public.fin_invoice_lines
  WHERE invoice_id = _credit;

  SELECT round(abs(coalesce(sum(ex_vat + vat), 0)), 2)
  INTO v_invoice_total
  FROM public.fin_invoice_lines
  WHERE invoice_id = _invoice;

  v_credit_open := round(greatest(0, v_credit_total - coalesce(v_credit.paid_amount, 0)), 2);
  v_invoice_open := round(greatest(0, v_invoice_total - coalesce(v_invoice.paid_amount, 0)), 2);

  IF v_amount > v_credit_open + 0.005 THEN
    RAISE EXCEPTION 'Bedrag (%) is groter dan het openstaand saldo van de creditnota (%)', v_amount, v_credit_open;
  END IF;

  IF v_amount > v_invoice_open + 0.005 THEN
    RAISE EXCEPTION 'Bedrag (%) is groter dan het openstaand saldo van de factuur (%)', v_amount, v_invoice_open;
  END IF;

  v_new_credit_paid := round(coalesce(v_credit.paid_amount, 0) + v_amount, 2);
  v_new_invoice_paid := round(coalesce(v_invoice.paid_amount, 0) + v_amount, 2);

  UPDATE public.fin_invoices
  SET
    paid_amount = v_new_credit_paid,
    status = CASE WHEN round(v_credit_total - v_new_credit_paid, 2) <= 0.005 THEN 'betaald' ELSE 'open' END,
    paid_at = CASE WHEN round(v_credit_total - v_new_credit_paid, 2) <= 0.005 THEN coalesce(paid_at, coalesce(_date, CURRENT_DATE)) ELSE paid_at END,
    original_invoice_id = coalesce(original_invoice_id, _invoice)
  WHERE id = _credit;

  UPDATE public.fin_invoices
  SET
    paid_amount = v_new_invoice_paid,
    status = CASE WHEN round(v_invoice_total - v_new_invoice_paid, 2) <= 0.005 THEN 'betaald' ELSE 'open' END,
    paid_at = CASE WHEN round(v_invoice_total - v_new_invoice_paid, 2) <= 0.005 THEN coalesce(paid_at, coalesce(_date, CURRENT_DATE)) ELSE paid_at END
  WHERE id = _invoice;

  RETURN jsonb_build_object(
    'amount', v_amount,
    'credit_remaining', round(greatest(0, v_credit_total - v_new_credit_paid), 2),
    'invoice_remaining', round(greatest(0, v_invoice_total - v_new_invoice_paid), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fin_offset_credit_note(uuid, uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_offset_credit_note(uuid, uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_offset_credit_note(uuid, uuid, numeric, date) TO service_role;