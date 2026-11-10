ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS subcontract_auto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.work_orders.subcontract_auto IS 'Automatisch afgesloten opdracht van een onderaannemer zonder login; factureren volgens goedgekeurde offerte.';

CREATE OR REPLACE FUNCTION public.close_subcontractor_work_orders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.work_orders w
     SET status = 'afgetekend', signed_at = now(), signed_name = 'Onderaannemer (automatisch afgesloten)', subcontract_auto = true
   WHERE w.status IN ('toegewezen', 'nieuw')
     AND w.scheduled_date IS NOT NULL
     AND w.scheduled_date < (now() AT TIME ZONE 'Europe/Brussels')::date
     AND COALESCE(w.not_needed, false) = false
     AND w.contract_id IS NULL
     AND EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = w.technician_id AND t.external_planning AND t.user_id IS NULL)
     AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.work_order_id = w.id AND q.status = 'akkoord');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.close_subcontractor_work_orders() FROM public, anon, authenticated;

SELECT cron.schedule('close-subcontractor-work-orders', '5 * * * *', 'SELECT public.close_subcontractor_work_orders()');