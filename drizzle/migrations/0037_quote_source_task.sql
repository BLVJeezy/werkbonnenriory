ALTER TABLE public.quotes ADD COLUMN source_work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX quotes_source_work_order_unique ON public.quotes(source_work_order_id) WHERE source_work_order_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.archive_quote_source_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.source_work_order_id IS NOT NULL THEN
  UPDATE public.work_orders SET status='offerte' WHERE id=NEW.source_work_order_id AND status <> 'afgetekend';
  IF NOT FOUND THEN RAISE EXCEPTION 'Alleen een open taak kan worden omgezet naar offerte'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_quote_source_task() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER quote_archive_source_task AFTER INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.archive_quote_source_task();