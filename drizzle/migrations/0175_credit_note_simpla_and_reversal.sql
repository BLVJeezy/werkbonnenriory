ALTER TABLE public.credit_note_allocations
  ADD COLUMN IF NOT EXISTS fin_invoice_id uuid REFERENCES public.fin_invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.credit_note_allocations
  DROP CONSTRAINT IF EXISTS credit_note_allocations_single_target;

ALTER TABLE public.credit_note_allocations
  ADD CONSTRAINT credit_note_allocations_single_target
  CHECK (NOT (invoice_id IS NOT NULL AND fin_invoice_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_credit_note_allocations_fin_invoice_id
  ON public.credit_note_allocations (fin_invoice_id)
  WHERE reversed_at IS NULL AND fin_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reverse_credit_note_allocation(
  p_allocation_id uuid,
  p_reason text DEFAULT 'Handmatig ongedaan gemaakt'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc public.credit_note_allocations;
  v_cn public.invoices;
  v_inv public.invoices;
  v_fi public.fin_invoices;
  v_new_cn_paid numeric;
  v_new_inv_paid numeric;
  v_fi_total numeric;
  v_new_fi_paid numeric;
  v_has_other_alloc boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen de beheerder kan creditnota-afletteringen ongedaan maken';
  END IF;

  SELECT * INTO v_alloc
  FROM public.credit_note_allocations
  WHERE id = p_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aflettering niet gevonden';
  END IF;

  IF v_alloc.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_alloc.id, 'already_reversed', true, 'amount', v_alloc.amount);
  END IF;

  IF v_alloc.bank_tx_id IS NOT NULL THEN
    RAISE EXCEPTION 'Deze aflettering is gekoppeld aan een bankverrichting en kan niet via deze weg worden teruggedraaid';
  END IF;

  -- Lock credit note
  SELECT * INTO v_cn FROM public.invoices WHERE id = v_alloc.credit_note_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creditnota niet gevonden';
  END IF;

  -- Restore target Werkbonnenriory invoice if applicable
  IF v_alloc.invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_alloc.invoice_id FOR UPDATE;
    IF FOUND THEN
      v_new_inv_paid := round(greatest(0, coalesce(v_inv.paid_amount, 0) - v_alloc.amount), 2);
      UPDATE public.invoices
      SET
        paid_amount = v_new_inv_paid,
        paid_at = CASE WHEN v_inv.total - v_new_inv_paid > 0.005 THEN NULL ELSE paid_at END
      WHERE id = v_inv.id;

      UPDATE public.fin_invoices
      SET
        paid_amount = v_new_inv_paid,
        status = CASE WHEN v_inv.total - v_new_inv_paid > 0.005 THEN 'open' ELSE 'betaald' END,
        paid_at = CASE WHEN v_inv.total - v_new_inv_paid > 0.005 THEN NULL ELSE paid_at END
      WHERE source = 'werkbonnen' AND source_ref = 'wb-' || v_inv.id::text;
    END IF;
  END IF;

  -- Restore target Simpla fin_invoice if applicable
  IF v_alloc.fin_invoice_id IS NOT NULL THEN
    SELECT * INTO v_fi FROM public.fin_invoices WHERE id = v_alloc.fin_invoice_id FOR UPDATE;
    IF FOUND THEN
      SELECT round(abs(coalesce(sum(ex_vat + vat), 0)), 2)
      INTO v_fi_total
      FROM public.fin_invoice_lines
      WHERE invoice_id = v_fi.id;

      v_new_fi_paid := round(greatest(0, coalesce(v_fi.paid_amount, 0) - v_alloc.amount), 2);
      UPDATE public.fin_invoices
      SET
        paid_amount = v_new_fi_paid,
        status = CASE WHEN v_fi_total - v_new_fi_paid > 0.005 THEN 'open' ELSE 'betaald' END,
        paid_at = CASE WHEN v_fi_total - v_new_fi_paid > 0.005 THEN NULL ELSE paid_at END
      WHERE id = v_fi.id;
    END IF;
  END IF;

  -- Mark allocation reversed (never delete)
  UPDATE public.credit_note_allocations
  SET
    reversed_at = now(),
    reversed_by = auth.uid(),
    reversal_reason = coalesce(nullif(trim(p_reason), ''), 'Handmatig ongedaan gemaakt')
  WHERE id = v_alloc.id;

  -- Restore credit note balance
  v_new_cn_paid := round(greatest(0, abs(coalesce(v_cn.paid_amount, 0)) - v_alloc.amount), 2);
  UPDATE public.invoices
  SET
    paid_amount = CASE WHEN v_new_cn_paid <= 0.005 THEN 0 ELSE -v_new_cn_paid END,
    paid_at = CASE WHEN abs(v_cn.total) - v_new_cn_paid > 0.005 THEN NULL ELSE paid_at END
  WHERE id = v_cn.id;

  SELECT EXISTS (
    SELECT 1 FROM public.credit_note_allocations
    WHERE credit_note_id = v_cn.id AND reversed_at IS NULL
  ) INTO v_has_other_alloc;

  UPDATE public.fin_invoices
  SET
    paid_amount = v_new_cn_paid,
    status = CASE WHEN abs(v_cn.total) - v_new_cn_paid > 0.005 THEN 'open' ELSE 'betaald' END,
    paid_at = CASE WHEN abs(v_cn.total) - v_new_cn_paid > 0.005 THEN NULL ELSE paid_at END,
    original_invoice_id = CASE WHEN v_has_other_alloc THEN original_invoice_id ELSE NULL END
  WHERE source = 'werkbonnen' AND source_ref = 'wb-' || v_cn.id::text;

  INSERT INTO public.fin_audit (user_id, entity, entity_id, action, detail)
  VALUES (
    coalesce(auth.uid(), v_alloc.created_by),
    'credit_note_allocation',
    v_alloc.id,
    'reversal',
    jsonb_build_object(
      'credit_note_id', v_cn.id,
      'credit_note_number', v_cn.number,
      'invoice_id', v_alloc.invoice_id,
      'fin_invoice_id', v_alloc.fin_invoice_id,
      'amount', v_alloc.amount,
      'reason', coalesce(nullif(trim(p_reason), ''), 'Handmatig ongedaan gemaakt')
    )
  );

  RETURN jsonb_build_object(
    'id', v_alloc.id,
    'already_reversed', false,
    'amount', v_alloc.amount,
    'credit_note_number', v_cn.number
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_credit_note_to_fin_invoice(
  p_credit uuid,
  p_fin_invoice uuid,
  p_amount numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_idempotency_key text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.invoices;
  fi public.fin_invoices;
  c_open numeric;
  fi_total numeric;
  fi_open numeric;
  amt numeric;
  v_new_fi_paid numeric;
  v_new_cn_paid numeric;
  v_existing public.credit_note_allocations;
  v_key text;
  v_alloc_id uuid;
  v_cn_name text;
  v_fi_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen de beheerder kan creditnota''s verrekenen';
  END IF;

  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing
    FROM public.credit_note_allocations
    WHERE idempotency_key = trim(p_idempotency_key) AND reversed_at IS NULL;
    IF FOUND THEN
      RETURN v_existing.amount;
    END IF;
  END IF;

  SELECT * INTO c FROM public.invoices WHERE id = p_credit FOR UPDATE;
  IF c.id IS NULL OR c.kind <> 'creditnota' THEN
    RAISE EXCEPTION 'Creditnota niet gevonden';
  END IF;

  SELECT * INTO fi FROM public.fin_invoices WHERE id = p_fin_invoice FOR UPDATE;
  IF fi.id IS NULL THEN
    RAISE EXCEPTION 'Simpla-factuur niet gevonden';
  END IF;

  IF NOT public.owns_fin_invoice(fi.id) THEN
    RAISE EXCEPTION 'Geen toegang tot deze Simpla-factuur';
  END IF;

  IF fi.source <> 'simpla' OR fi.direction <> 'verkoop' OR fi.doc_type <> 'factuur' THEN
    RAISE EXCEPTION 'Alleen echte geïmporteerde Simpla-verkoopfacturen kunnen via deze optie worden afgeboekt';
  END IF;

  v_cn_name := lower(regexp_replace(trim(coalesce(c.customer->>'name', '')), '\s+', ' ', 'g'));
  v_fi_name := lower(regexp_replace(trim(coalesce(fi.counterparty, '')), '\s+', ' ', 'g'));
  IF v_cn_name = '' OR v_fi_name = '' OR v_cn_name <> v_fi_name THEN
    RAISE EXCEPTION 'Een klanttegoed mag alleen verrekend worden met een Simpla-factuur van dezelfde klant';
  END IF;

  c_open := round(greatest(0, abs(c.total) - abs(c.paid_amount)), 2);
  IF c_open <= 0.005 THEN
    RAISE EXCEPTION 'Deze creditnota is al volledig verrekend';
  END IF;

  SELECT round(abs(coalesce(sum(ex_vat + vat), 0)), 2)
  INTO fi_total
  FROM public.fin_invoice_lines
  WHERE invoice_id = fi.id;

  fi_open := round(greatest(0, fi_total - coalesce(fi.paid_amount, 0)), 2);
  IF fi_open <= 0.005 THEN
    RAISE EXCEPTION 'Simpla-factuur % is al volledig betaald', fi.number;
  END IF;

  amt := round(coalesce(p_amount, least(c_open, fi_open)), 2);
  IF amt <= 0 THEN
    RAISE EXCEPTION 'Bedrag moet groter dan 0 zijn';
  END IF;
  IF amt > c_open + 0.005 THEN
    RAISE EXCEPTION 'Bedrag is hoger dan het openstaande saldo van de creditnota (%)', c_open;
  END IF;
  IF amt > fi_open + 0.005 THEN
    RAISE EXCEPTION 'Bedrag is hoger dan het openstaande saldo van Simpla-factuur % (%)', fi.number, fi_open;
  END IF;

  v_new_fi_paid := round(coalesce(fi.paid_amount, 0) + amt, 2);
  UPDATE public.fin_invoices
  SET
    paid_amount = v_new_fi_paid,
    status = CASE WHEN fi_total - v_new_fi_paid <= 0.005 THEN 'betaald' ELSE 'open' END,
    paid_at = CASE WHEN fi_total - v_new_fi_paid <= 0.005 THEN coalesce(paid_at, coalesce(p_date, current_date)) ELSE paid_at END
  WHERE id = fi.id;

  v_new_cn_paid := round(abs(c.paid_amount) + amt, 2);
  UPDATE public.invoices
  SET
    paid_amount = -v_new_cn_paid,
    paid_at = CASE WHEN abs(c.total) - v_new_cn_paid <= 0.005 THEN coalesce(p_date, current_date)::timestamptz ELSE paid_at END
  WHERE id = c.id;

  UPDATE public.fin_invoices
  SET
    paid_amount = v_new_cn_paid,
    status = CASE WHEN abs(c.total) - v_new_cn_paid <= 0.005 THEN 'betaald' ELSE 'open' END,
    paid_at = CASE WHEN abs(c.total) - v_new_cn_paid <= 0.005 THEN coalesce(paid_at, coalesce(p_date, current_date)) ELSE paid_at END,
    original_invoice_id = coalesce(original_invoice_id, fi.id)
  WHERE source = 'werkbonnen' AND source_ref = 'wb-' || c.id::text;

  v_key := coalesce(nullif(trim(p_idempotency_key), ''), 'manual_simpla:' || c.id::text || ':' || fi.id::text || ':' || gen_random_uuid()::text);

  INSERT INTO public.credit_note_allocations (
    credit_note_id, invoice_id, fin_invoice_id, allocation_type, amount, allocated_date, idempotency_key, note, created_by
  )
  VALUES (
    c.id, NULL, fi.id, 'manual_offset', amt, coalesce(p_date, current_date), v_key, 'Afgeboekt tegen geïmporteerde Simpla-factuur ' || coalesce(fi.number, ''), auth.uid()
  )
  RETURNING id INTO v_alloc_id;

  INSERT INTO public.fin_audit (user_id, entity, entity_id, action, detail)
  VALUES (
    auth.uid(),
    'credit_note_allocation',
    v_alloc_id,
    'manual_simpla_offset',
    jsonb_build_object(
      'credit_note_id', c.id,
      'credit_note_number', c.number,
      'fin_invoice_id', fi.id,
      'fin_invoice_number', fi.number,
      'source', 'simpla',
      'amount', amt,
      'allocated_date', coalesce(p_date, current_date)
    )
  );

  RETURN amt;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_credit_note_allocation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_credit_note_allocation(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_credit_note_to_fin_invoice(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_credit_note_to_fin_invoice(uuid, uuid, numeric, date, text) TO authenticated, service_role;