ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE public.invoices SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE public.invoices ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.invoices ALTER COLUMN updated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_updated_at_id_idx ON public.invoices (updated_at, id);

CREATE OR REPLACE FUNCTION public.touch_invoice_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS invoices_touch_updated_at ON public.invoices;
CREATE TRIGGER invoices_touch_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_updated_at();

CREATE FUNCTION public.attribution_invoices(_after timestamptz, _after_id uuid, _limit int)
RETURNS TABLE(id uuid, number text, kind text, status text, issue_date date, due_date date, sent_at timestamptz,
  paid_at timestamptz, paid_amount numeric, net numeric, vat numeric, total numeric, vat_rate numeric, credit_for uuid,
  created_at timestamptz, updated_at timestamptz, customer_id uuid, customer jsonb, lines jsonb, work_orders jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.number, i.kind, i.status, i.issue_date, i.due_date, i.sent_at, i.paid_at, i.paid_amount,
         i.net, i.vat, i.total, i.vat_rate, i.credit_for, i.created_at, i.updated_at,
         COALESCE(
           (SELECT w.customer_id FROM public.work_orders w
             WHERE w.id = ANY (array_prepend(i.work_order_id, COALESCE(i.extra_work_order_ids, '{}'::uuid[]))) AND w.customer_id IS NOT NULL
             ORDER BY w.id = i.work_order_id DESC LIMIT 1),
           (SELECT w.customer_id FROM public.invoices o JOIN public.work_orders w ON w.id = o.work_order_id WHERE o.id = i.credit_for)
         ) AS customer_id,
         i.customer, i.lines,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'activity', a.name, 'signed_at', w.signed_at,
                     'postal_code', w.postal_code, 'first_customer', COALESCE(w.first_customer, false)) ORDER BY w.id = i.work_order_id DESC, w.id)
                   FROM public.work_orders w LEFT JOIN public.activities a ON a.id = w.activity_id
                   WHERE w.id = ANY (array_prepend(i.work_order_id, COALESCE(i.extra_work_order_ids, '{}'::uuid[])))), '[]'::jsonb) AS work_orders
  FROM public.invoices i
  WHERE NOT (i.status = 'concept' AND i.sent_at IS NULL)
    AND (_after IS NULL OR (i.updated_at, i.id) > (_after, _after_id))
  ORDER BY i.updated_at, i.id
  LIMIT LEAST(GREATEST(_limit, 1), 101)
$$;
REVOKE ALL ON FUNCTION public.attribution_invoices(timestamptz, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribution_invoices(timestamptz, uuid, int) TO service_role;