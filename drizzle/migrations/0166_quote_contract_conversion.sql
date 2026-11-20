ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_kind_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_kind_check CHECK (kind = ANY (ARRAY['offerte'::text, 'verzekering'::text, 'contract'::text]));

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS contract_repeat_every integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS contract_repeat_unit text NOT NULL DEFAULT 'maand',
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.approve_quote_planning()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'akkoord' AND NEW.work_order_id IS NULL AND NEW.kind <> 'contract' THEN
    PERFORM public.ensure_approved_quote_task(NEW.id);
  END IF;
  IF NEW.work_order_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.technician_id IS DISTINCT FROM OLD.technician_id) THEN
    UPDATE public.work_orders
      SET technician_id = NEW.technician_id,
          status = CASE WHEN status = 'afgetekend' THEN status WHEN NEW.technician_id IS NULL THEN 'nieuw' ELSE 'toegewezen' END
      WHERE id = NEW.work_order_id;
  END IF;
  RETURN NEW;
END;
$function$;