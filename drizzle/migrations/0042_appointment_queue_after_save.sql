CREATE OR REPLACE FUNCTION public.queue_processed_appointment_mail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.source_message_id IS NOT NULL AND (NEW.scheduled_date IS NOT NULL OR NEW.status='offerte' OR NEW.quote_pending) THEN
 INSERT INTO public.appointment_mail_moves(work_order_id,user_id,source_message_id) VALUES(NEW.id,NEW.source_mailbox_user_id,NEW.source_message_id) ON CONFLICT(work_order_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER queue_processed_appointment_mail ON public.work_orders;
CREATE TRIGGER queue_processed_appointment_mail AFTER INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.queue_processed_appointment_mail();
CREATE OR REPLACE FUNCTION public.guard_quote_task_visibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.quote_pending := EXISTS(SELECT 1 FROM public.quotes q WHERE q.source_work_order_id=NEW.id OR(q.work_order_id=NEW.id AND q.status<>'akkoord'));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_quote_task_visibility() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_quote_task_visibility BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.guard_quote_task_visibility();