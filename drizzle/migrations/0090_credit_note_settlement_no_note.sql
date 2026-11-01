CREATE OR REPLACE FUNCTION public.settle_credit_note(p_credit uuid, p_invoice uuid, p_amount numeric, p_date date)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.invoices; i public.invoices; c_open numeric; i_open numeric; amt numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Alleen de beheerder kan creditnota''s verrekenen'; END IF;
  SELECT * INTO c FROM public.invoices WHERE id = p_credit FOR UPDATE;
  IF c.id IS NULL OR c.kind <> 'creditnota' THEN RAISE EXCEPTION 'Creditnota niet gevonden'; END IF;
  c_open := round(abs(c.total) - abs(c.paid_amount), 2);
  IF c_open <= 0.005 THEN RAISE EXCEPTION 'Deze creditnota is al volledig verrekend'; END IF;
  amt := round(coalesce(p_amount, c_open), 2);
  IF amt <= 0 THEN RAISE EXCEPTION 'Bedrag moet groter dan 0 zijn'; END IF;
  IF amt > c_open + 0.005 THEN RAISE EXCEPTION 'Bedrag is hoger dan het openstaande saldo van de creditnota (%)', c_open; END IF;
  IF p_invoice IS NOT NULL THEN
    SELECT * INTO i FROM public.invoices WHERE id = p_invoice FOR UPDATE;
    IF i.id IS NULL OR i.kind = 'creditnota' THEN RAISE EXCEPTION 'Factuur niet gevonden'; END IF;
    i_open := round(i.total - i.paid_amount, 2);
    IF i_open <= 0.005 THEN RAISE EXCEPTION 'Factuur % is al betaald', i.number; END IF;
    IF amt > i_open + 0.005 THEN RAISE EXCEPTION 'Bedrag is hoger dan het openstaande saldo van factuur % (%)', i.number, i_open; END IF;
    UPDATE public.invoices SET paid_amount = paid_amount + amt,
      paid_at = CASE WHEN i.total - (i.paid_amount + amt) <= 0.005 THEN coalesce(p_date, current_date)::timestamptz ELSE paid_at END
      WHERE id = i.id;
  END IF;
  UPDATE public.invoices SET paid_amount = paid_amount - amt,
    paid_at = CASE WHEN abs(c.total) - (abs(c.paid_amount) + amt) <= 0.005 THEN coalesce(p_date, current_date)::timestamptz ELSE paid_at END
    WHERE id = c.id;
  RETURN amt;
END $$;