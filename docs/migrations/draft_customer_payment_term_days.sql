-- DRAFT / INERT MIGRATION — DO NOT EXECUTE AUTOMATICALLY
-- Feature: Per-customer optional payment term in calendar days (0–60).
-- Additive and backward deploy-safe:
--   - Nullable column on public.customers; NULL means use existing global settings.payment_days (14).
--   - Bounded integer check (0–60).
--   - No backfill, no changes to existing customers, invoices, contracts, or settings.payment_days.
--   - Updates create_contract_completion_invoice in place (same signature) to use
--     COALESCE(customer.payment_term_days, settings.payment_days, 14) for new contract invoices.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS payment_term_days integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_payment_term_days_range_chk'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_payment_term_days_range_chk
      CHECK (payment_term_days IS NULL OR (payment_term_days >= 0 AND payment_term_days <= 60));
  END IF;
END $$;

COMMENT ON COLUMN public.customers.payment_term_days IS
  'Optional customer-specific invoice payment term in calendar days (0-60). NULL falls back to settings.payment_days.';

-- Defense in depth for the existing shared customer form and direct Data API
-- writes. Only a real admin user ID may set or actually change this financial
-- term. Trusted service/migration roles remain able to maintain the schema/data;
-- an arbitrary request with NULL auth.uid() is never treated as an admin.
CREATE OR REPLACE FUNCTION public.guard_customer_payment_term_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.payment_term_days IS NOT NULL THEN
    RAISE EXCEPTION 'Only admins may set customer payment terms'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.payment_term_days IS DISTINCT FROM OLD.payment_term_days THEN
    RAISE EXCEPTION 'Only admins may change customer payment terms'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.guard_customer_payment_term_days() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_customer_payment_term_days() TO service_role;

CREATE OR REPLACE TRIGGER customers_payment_term_days_admin_guard
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.guard_customer_payment_term_days();

CREATE OR REPLACE FUNCTION public.create_contract_completion_invoice(
  p_work_order uuid,
  p_customer jsonb,
  p_lines jsonb,
  p_net numeric,
  p_vat numeric,
  p_total numeric,
  p_vat_rate numeric,
  p_reference text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.contract_billing_queue;
  result uuid;
  issue date = (now() AT TIME ZONE 'Europe/Brussels')::date;
  term_days integer;
  n integer;
  prefix text;
BEGIN
  SELECT * INTO q FROM public.contract_billing_queue WHERE work_order_id = p_work_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No queued completion'; END IF;

  SELECT id INTO result FROM public.invoices WHERE work_order_id = p_work_order AND contract_id IS NOT NULL AND kind = 'factuur';
  IF result IS NULL THEN
    SELECT COALESCE(
      (
        SELECT cust.payment_term_days
        FROM public.contracts ctr
        JOIN public.customers cust ON cust.id = ctr.customer_id
        WHERE ctr.id = q.contract_id
          AND cust.payment_term_days BETWEEN 0 AND 60
      ),
      (SELECT payment_days FROM public.settings WHERE id = 1),
      14
    ) INTO term_days;

    UPDATE public.settings
      SET next_invoice_number = next_invoice_number + 1
      WHERE id = 1
      RETURNING next_invoice_number - 1, invoice_prefix INTO n, prefix;

    INSERT INTO public.invoices(
      number, work_order_id, contract_id, contract_reference,
      issue_date, due_date, customer, lines, vat_rate, net, vat, total, paid_amount
    )
    VALUES (
      prefix || n::text, p_work_order, q.contract_id, p_reference,
      issue, issue + term_days, p_customer, p_lines, p_vat_rate, p_net, p_vat, p_total, 0
    )
    RETURNING id INTO result;
  END IF;

  UPDATE public.contract_billing_queue
    SET invoice_id = result, status = 'created', updated_at = now()
    WHERE work_order_id = p_work_order;

  RETURN result;
END
$$;

REVOKE ALL ON FUNCTION public.create_contract_completion_invoice(uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_completion_invoice(uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, text) TO service_role;