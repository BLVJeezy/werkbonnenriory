CREATE TABLE IF NOT EXISTS public.credit_note_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE RESTRICT,
  allocation_type text NOT NULL CHECK (allocation_type IN ('auto_origin', 'manual_offset', 'bank_refund', 'manual_refund')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  allocated_date date NOT NULL DEFAULT CURRENT_DATE,
  bank_tx_id uuid REFERENCES public.fin_bank_tx(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid,
  CONSTRAINT credit_note_allocations_idempotency_unique UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_note_allocations_auto_origin
  ON public.credit_note_allocations (credit_note_id, invoice_id)
  WHERE allocation_type = 'auto_origin' AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_credit_note_allocations_credit_note_id
  ON public.credit_note_allocations (credit_note_id)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_credit_note_allocations_invoice_id
  ON public.credit_note_allocations (invoice_id)
  WHERE reversed_at IS NULL AND invoice_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_allocations TO authenticated;
GRANT ALL ON public.credit_note_allocations TO service_role;

ALTER TABLE public.credit_note_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage credit note allocations" ON public.credit_note_allocations;
CREATE POLICY "Admins manage credit note allocations"
  ON public.credit_note_allocations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.same_invoice_customer(a jsonb, b jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  vat_a text;
  vat_b text;
  name_a text;
  name_b text;
BEGIN
  vat_a := regexp_replace(upper(coalesce(a->>'vatNumber', '')), '[^A-Z0-9]', '', 'g');
  vat_b := regexp_replace(upper(coalesce(b->>'vatNumber', '')), '[^A-Z0-9]', '', 'g');
  IF vat_a <> '' AND vat_b <> '' THEN
    RETURN vat_a = vat_b;
  END IF;
  name_a := lower(regexp_replace(trim(coalesce(a->>'name', '')), '\s+', ' ', 'g'));
  name_b := lower(regexp_replace(trim(coalesce(b->>'name', '')), '\s+', ' ', 'g'));
  IF name_a = '' OR name_b = '' THEN
    RETURN false;
  END IF;
  RETURN name_a = name_b;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_credit_note(
  p_credit uuid,
  p_invoice uuid,
  p_amount numeric,
  p_date date,
  p_idempotency_key text DEFAULT NULL,
  p_bank_tx_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.invoices;
  i public.invoices;
  c_open numeric;
  i_open numeric;
  amt numeric;
  v_fin_inv_id uuid;
  v_new_inv_paid numeric;
  v_new_cn_paid numeric;
  v_existing public.credit_note_allocations;
  v_key text;
  v_type text;
  v_alloc_id uuid;
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

  -- Lock in fixed ID order to prevent deadlocks
  IF p_invoice IS NOT NULL AND p_invoice < p_credit THEN
    SELECT * INTO i FROM public.invoices WHERE id = p_invoice FOR UPDATE;
    SELECT * INTO c FROM public.invoices WHERE id = p_credit FOR UPDATE;
  ELSE
    SELECT * INTO c FROM public.invoices WHERE id = p_credit FOR UPDATE;
    IF p_invoice IS NOT NULL THEN
      SELECT * INTO i FROM public.invoices WHERE id = p_invoice FOR UPDATE;
    END IF;
  END IF;

  IF c.id IS NULL OR c.kind <> 'creditnota' THEN
    RAISE EXCEPTION 'Creditnota niet gevonden';
  END IF;

  c_open := round(greatest(0, abs(c.total) - abs(c.paid_amount)), 2);
  IF c_open <= 0.005 THEN
    RAISE EXCEPTION 'Deze creditnota is al volledig verrekend';
  END IF;

  amt := round(coalesce(p_amount, c_open), 2);
  IF amt <= 0 THEN
    RAISE EXCEPTION 'Bedrag moet groter dan 0 zijn';
  END IF;
  IF amt > c_open + 0.005 THEN
    RAISE EXCEPTION 'Bedrag is hoger dan het openstaande saldo van de creditnota (%)', c_open;
  END IF;

  IF p_invoice IS NOT NULL THEN
    IF i.id IS NULL OR i.kind = 'creditnota' THEN
      RAISE EXCEPTION 'Factuur niet gevonden';
    END IF;
    IF i.id <> c.credit_for AND NOT public.same_invoice_customer(c.customer, i.customer) THEN
      RAISE EXCEPTION 'Een klanttegoed mag alleen verrekend worden met een factuur van dezelfde klant';
    END IF;
    i_open := round(greatest(0, i.total - i.paid_amount), 2);
    IF i_open <= 0.005 THEN
      RAISE EXCEPTION 'Factuur % is al betaald', i.number;
    END IF;
    IF amt > i_open + 0.005 THEN
      RAISE EXCEPTION 'Bedrag is hoger dan het openstaande saldo van factuur % (%)', i.number, i_open;
    END IF;

    v_new_inv_paid := round(i.paid_amount + amt, 2);
    UPDATE public.invoices
    SET
      paid_amount = v_new_inv_paid,
      paid_at = CASE WHEN i.total - v_new_inv_paid <= 0.005 THEN coalesce(p_date, current_date)::timestamptz ELSE paid_at END
    WHERE id = i.id;

    UPDATE public.fin_invoices
    SET
      paid_amount = v_new_inv_paid,
      status = CASE WHEN i.total - v_new_inv_paid <= 0.005 THEN 'betaald' ELSE 'open' END,
      paid_at = CASE WHEN i.total - v_new_inv_paid <= 0.005 THEN coalesce(paid_at, coalesce(p_date, current_date)) ELSE paid_at END
    WHERE source = 'werkbonnen' AND source_ref = 'wb-' || i.id::text
    RETURNING id INTO v_fin_inv_id;

    v_type := CASE WHEN p_idempotency_key LIKE 'auto_origin:%' THEN 'auto_origin' ELSE 'manual_offset' END;
  ELSE
    v_type := CASE WHEN p_bank_tx_id IS NOT NULL THEN 'bank_refund' ELSE 'manual_refund' END;
  END IF;

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
    original_invoice_id = coalesce(original_invoice_id, v_fin_inv_id)
  WHERE source = 'werkbonnen' AND source_ref = 'wb-' || c.id::text;

  v_key := coalesce(nullif(trim(p_idempotency_key), ''), v_type || ':' || c.id::text || ':' || coalesce(p_invoice::text, 'refund') || ':' || gen_random_uuid()::text);

  INSERT INTO public.credit_note_allocations (
    credit_note_id, invoice_id, allocation_type, amount, allocated_date, bank_tx_id, idempotency_key, created_by
  )
  VALUES (
    c.id, p_invoice, v_type, amt, coalesce(p_date, current_date), p_bank_tx_id, v_key, auth.uid()
  )
  RETURNING id INTO v_alloc_id;

  INSERT INTO public.fin_audit (user_id, entity, entity_id, action, detail)
  VALUES (
    auth.uid(),
    'credit_note_allocation',
    v_alloc_id,
    v_type,
    jsonb_build_object(
      'credit_note_id', c.id,
      'credit_note_number', c.number,
      'invoice_id', p_invoice,
      'invoice_number', CASE WHEN p_invoice IS NOT NULL THEN i.number ELSE NULL END,
      'amount', amt,
      'allocated_date', coalesce(p_date, current_date),
      'bank_tx_id', p_bank_tx_id
    )
  );

  RETURN amt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_allocate_credit_note(p_credit uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.invoices;
  i public.invoices;
  c_open numeric;
  i_open numeric;
  v_alloc numeric;
  v_key text;
  v_existing public.credit_note_allocations;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen de beheerder kan creditnota''s verrekenen';
  END IF;

  SELECT * INTO c FROM public.invoices WHERE id = p_credit;
  IF c.id IS NULL OR c.kind <> 'creditnota' THEN
    RAISE EXCEPTION 'Creditnota niet gevonden';
  END IF;

  c_open := round(greatest(0, abs(c.total) - abs(c.paid_amount)), 2);

  IF c.credit_for IS NULL THEN
    RETURN jsonb_build_object('allocated', 0, 'surplus', c_open, 'status', 'no_origin', 'idempotent', false);
  END IF;

  v_key := 'auto_origin:' || c.id::text || ':' || c.credit_for::text;
  SELECT * INTO v_existing FROM public.credit_note_allocations WHERE idempotency_key = v_key AND reversed_at IS NULL;
  IF FOUND THEN
    RETURN jsonb_build_object('allocated', v_existing.amount, 'surplus', c_open, 'status', 'already_allocated', 'idempotent', true);
  END IF;

  SELECT * INTO i FROM public.invoices WHERE id = c.credit_for;
  IF i.id IS NULL OR i.kind = 'creditnota' THEN
    RETURN jsonb_build_object('allocated', 0, 'surplus', c_open, 'status', 'origin_not_found', 'idempotent', false);
  END IF;

  i_open := round(greatest(0, i.total - i.paid_amount), 2);
  v_alloc := round(least(c_open, i_open), 2);

  IF v_alloc > 0.005 THEN
    PERFORM public.settle_credit_note(c.id, i.id, v_alloc, coalesce(p_date, current_date), v_key, NULL);
  END IF;

  RETURN jsonb_build_object(
    'allocated', v_alloc,
    'surplus', round(greatest(0, c_open - v_alloc), 2),
    'invoice_open_after', round(greatest(0, i_open - v_alloc), 2),
    'status', CASE
      WHEN v_alloc <= 0.005 AND c_open > 0.005 THEN 'customer_credit'
      WHEN round(greatest(0, c_open - v_alloc), 2) > 0.005 THEN 'partial_credit'
      ELSE 'settled'
    END,
    'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.backfill_credit_note_allocations(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  v_items jsonb := '[]'::jsonb;
  v_alloc numeric;
  v_surplus numeric;
  v_count integer := 0;
  v_res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen de beheerder kan deze backfill uitvoeren';
  END IF;

  FOR rec IN
    SELECT
      c.id AS credit_id,
      c.number AS credit_number,
      c.issue_date,
      c.customer->>'name' AS customer_name,
      round(greatest(0, abs(c.total) - abs(c.paid_amount)), 2) AS credit_open,
      o.id AS origin_id,
      o.number AS origin_number,
      round(greatest(0, o.total - o.paid_amount), 2) AS origin_open
    FROM public.invoices c
    JOIN public.invoices o ON o.id = c.credit_for
    WHERE c.kind = 'creditnota'
      AND c.credit_for IS NOT NULL
      AND round(greatest(0, abs(c.total) - abs(c.paid_amount)), 2) > 0.005
      AND NOT EXISTS (
        SELECT 1 FROM public.credit_note_allocations a
        WHERE a.credit_note_id = c.id AND a.invoice_id = o.id AND a.allocation_type = 'auto_origin' AND a.reversed_at IS NULL
      )
    ORDER BY c.created_at ASC
  LOOP
    v_alloc := round(least(rec.credit_open, rec.origin_open), 2);
    v_surplus := round(greatest(0, rec.credit_open - v_alloc), 2);
    IF NOT p_dry_run AND v_alloc > 0.005 THEN
      v_res := public.auto_allocate_credit_note(rec.credit_id, coalesce(rec.issue_date, current_date));
    END IF;
    v_items := v_items || jsonb_build_object(
      'credit_id', rec.credit_id,
      'credit_number', rec.credit_number,
      'origin_id', rec.origin_id,
      'origin_number', rec.origin_number,
      'customer_name', rec.customer_name,
      'would_allocate', v_alloc,
      'surplus_credit', v_surplus
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'count', v_count, 'items', v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_unsent_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invoices;
  v_num integer;
  v_prefix text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factuur niet gevonden'; END IF;
  IF v_inv.status <> 'concept' OR v_inv.sent_at IS NOT NULL OR v_inv.pdf_sent_at IS NOT NULL OR v_inv.okioki_sent_at IS NOT NULL OR v_inv.post_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Alleen nog niet verzonden concepten kunnen worden verwijderd';
  END IF;
  IF abs(coalesce(v_inv.paid_amount, 0)) > 0.005 THEN
    RAISE EXCEPTION 'Dit document is al (deels) betaald of verrekend en kan niet worden verwijderd';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_note_allocations WHERE (credit_note_id = _invoice_id OR invoice_id = _invoice_id) AND reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Dit document heeft al verrekende creditnota-allocaties en kan niet worden verwijderd';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE credit_for = _invoice_id) THEN
    RAISE EXCEPTION 'Er bestaat een creditnota op deze factuur';
  END IF;

  DELETE FROM public.invoices WHERE id = _invoice_id;

  SELECT invoice_prefix, next_invoice_number INTO v_prefix, v_num FROM public.settings WHERE id = 1 FOR UPDATE;
  IF v_inv.number = v_prefix || (v_num - 1)::text THEN
    UPDATE public.settings SET next_invoice_number = v_num - 1 WHERE id = 1;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_allocate_credit_note(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_allocate_credit_note(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.backfill_credit_note_allocations(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_credit_note_allocations(boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_credit_note(uuid, uuid, numeric, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_credit_note(uuid, uuid, numeric, date, text, uuid) TO authenticated, service_role;