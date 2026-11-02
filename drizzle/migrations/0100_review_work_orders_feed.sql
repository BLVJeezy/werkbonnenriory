CREATE OR REPLACE FUNCTION public.review_completed_work_orders(_after timestamptz, _after_id uuid, _limit int)
RETURNS TABLE(id uuid, completed_at timestamptz, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, COALESCE(w.signed_at, w.paid_at) AS completed_at,
         NULLIF(btrim(COALESCE(NULLIF(btrim(w.billing_email), ''), w.email)), '') AS email
  FROM public.work_orders w
  WHERE w.status = 'afgetekend' AND COALESCE(w.signed_at, w.paid_at) IS NOT NULL
    AND (_after IS NULL OR (COALESCE(w.signed_at, w.paid_at), w.id) > (_after, _after_id))
  ORDER BY COALESCE(w.signed_at, w.paid_at), w.id
  LIMIT LEAST(GREATEST(_limit, 1), 101)
$$;
REVOKE ALL ON FUNCTION public.review_completed_work_orders(timestamptz, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_completed_work_orders(timestamptz, uuid, int) TO service_role;