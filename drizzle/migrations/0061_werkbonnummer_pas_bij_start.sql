ALTER TABLE public.work_orders ALTER COLUMN number DROP DEFAULT;
ALTER TABLE public.work_orders ALTER COLUMN number DROP NOT NULL;

COMMENT ON COLUMN public.work_orders.number IS 'Werkbonnummer; wordt pas toegekend bij de eerste tijdstart of bij afronden. Taken zonder nummer zijn nog niet gestart.';

CREATE OR REPLACE FUNCTION public.assign_work_order_number_on_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.work_orders
  SET number = nextval('public.work_orders_number_seq')
  WHERE id = NEW.work_order_id AND number IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_work_order_number_on_time_entry
AFTER INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.assign_work_order_number_on_time_entry();

CREATE OR REPLACE FUNCTION public.assign_work_order_number_on_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.number IS NULL AND NEW.status = 'afgetekend' AND OLD.status IS DISTINCT FROM 'afgetekend' THEN
    NEW.number := nextval('public.work_orders_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_work_order_number_on_complete
BEFORE UPDATE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.assign_work_order_number_on_complete();