ALTER TABLE public.work_orders ADD COLUMN source_mailbox_user_id uuid;
ALTER TABLE public.work_orders ADD COLUMN quote_pending boolean NOT NULL DEFAULT false;
UPDATE public.work_orders w SET quote_pending=true WHERE EXISTS(SELECT 1 FROM public.quotes q WHERE q.source_work_order_id=w.id OR (q.work_order_id=w.id AND q.status<>'akkoord'));
CREATE TABLE public.appointment_mail_moves (
 work_order_id uuid PRIMARY KEY REFERENCES public.work_orders(id) ON DELETE CASCADE,
 user_id uuid,
 source_message_id text NOT NULL,
 immutable_message_id text,
 moved_at timestamptz,
 last_error text,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.appointment_mail_moves TO service_role;
ALTER TABLE public.appointment_mail_moves ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.queue_processed_appointment_mail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.quote_pending := EXISTS(SELECT 1 FROM public.quotes q WHERE q.source_work_order_id=NEW.id OR (q.work_order_id=NEW.id AND q.status<>'akkoord'));
 IF NEW.source_message_id IS NOT NULL AND (NEW.scheduled_date IS NOT NULL OR NEW.status='offerte' OR NEW.quote_pending) THEN
 INSERT INTO public.appointment_mail_moves(work_order_id,user_id,source_message_id) VALUES(NEW.id,NEW.source_mailbox_user_id,NEW.source_message_id) ON CONFLICT(work_order_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_processed_appointment_mail() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER queue_processed_appointment_mail BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.queue_processed_appointment_mail();
CREATE OR REPLACE FUNCTION public.refresh_quote_task_visibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.work_orders w SET quote_pending=EXISTS(SELECT 1 FROM public.quotes q WHERE q.source_work_order_id=w.id OR(q.work_order_id=w.id AND q.status<>'akkoord')) WHERE w.id IN(NEW.source_work_order_id,NEW.work_order_id);
 IF TG_OP='UPDATE' THEN
 UPDATE public.work_orders w SET quote_pending=EXISTS(SELECT 1 FROM public.quotes q WHERE q.source_work_order_id=w.id OR(q.work_order_id=w.id AND q.status<>'akkoord')) WHERE w.id IN(OLD.source_work_order_id,OLD.work_order_id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.refresh_quote_task_visibility() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER refresh_quote_task_visibility AFTER INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.refresh_quote_task_visibility();
INSERT INTO public.appointment_mail_moves(work_order_id,user_id,source_message_id) SELECT id,source_mailbox_user_id,source_message_id FROM public.work_orders WHERE source_message_id IS NOT NULL AND (scheduled_date IS NOT NULL OR status='offerte' OR quote_pending);
COMMENT ON TABLE public.appointment_mail_moves IS 'Service-only durable move queue; legacy null owners must be verified against the callers connected mailbox before claiming.';