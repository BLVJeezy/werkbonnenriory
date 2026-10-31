CREATE OR REPLACE FUNCTION public.tech_reopen_work_order(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.id = _id AND w.technician_id = my_technician_id()) THEN
    RAISE EXCEPTION 'Geen toegang tot deze bon';
  END IF;
  IF EXISTS (SELECT 1 FROM work_orders w WHERE w.id = _id AND w.paid_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Afgerekende bonnen kunnen niet heropend worden';
  END IF;
  IF EXISTS (SELECT 1 FROM invoices i WHERE i.work_order_id = _id) THEN
    RAISE EXCEPTION 'Er is al een factuur voor deze bon';
  END IF;
  UPDATE work_orders SET status = 'toegewezen', signature = NULL, signed_name = NULL, signed_at = NULL
  WHERE id = _id AND status = 'afgetekend';
END $$;
REVOKE ALL ON FUNCTION public.tech_reopen_work_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tech_reopen_work_order(uuid) TO authenticated;