CREATE OR REPLACE FUNCTION public.create_numbered_invoice(
  p_work_order_id uuid,
  p_issue_date date,
  p_due_date date,
  p_customer jsonb,
  p_lines jsonb,
  p_vat_rate numeric,
  p_net numeric,
  p_vat numeric,
  p_total numeric,
  p_paid_amount numeric,
  p_kind text DEFAULT 'factuur',
  p_credit_for uuid DEFAULT NULL,
  p_contract_reference text DEFAULT NULL
) RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer; p text; r public.invoices;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.settings SET next_invoice_number = next_invoice_number + 1 WHERE id = 1
    RETURNING next_invoice_number - 1, invoice_prefix INTO n, p;
  INSERT INTO public.invoices(number, work_order_id, issue_date, due_date, customer, lines, vat_rate, net, vat, total, paid_amount, kind, credit_for, contract_reference)
  VALUES (p || n::text, p_work_order_id, p_issue_date, p_due_date, p_customer, p_lines, p_vat_rate, p_net, p_vat, p_total, p_paid_amount, p_kind, p_credit_for, p_contract_reference)
  RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.create_numbered_invoice(uuid, date, date, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_numbered_invoice(uuid, date, date, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, text, uuid, text) TO authenticated;