ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS not_needed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.queue_processed_appointment_mail()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 NEW.quote_pending := EXISTS(SELECT 1 FROM public.quotes q WHERE q.kind <> 'verzekering' AND (q.source_work_order_id=NEW.id OR (q.work_order_id=NEW.id AND q.status<>'akkoord')));
 IF NEW.source_message_id IS NOT NULL AND (NEW.scheduled_date IS NOT NULL OR NEW.status='offerte' OR NEW.quote_pending OR NEW.not_needed) THEN
  INSERT INTO public.appointment_mail_moves(work_order_id,user_id,source_message_id) VALUES(NEW.id,NEW.source_mailbox_user_id,NEW.source_message_id) ON CONFLICT(work_order_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $function$;