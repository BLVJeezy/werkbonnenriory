CREATE OR REPLACE FUNCTION public.invalidate_appointment_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.technician_id IS DISTINCT FROM OLD.technician_id OR (NEW.status='afgetekend' AND OLD.status<>'afgetekend') THEN
 DELETE FROM public.appointment_requests WHERE work_order_id=NEW.id;
 ELSIF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.scheduled_from IS DISTINCT FROM OLD.scheduled_from OR NEW.scheduled_until IS DISTINCT FROM OLD.scheduled_until THEN
 UPDATE public.appointment_requests SET customer_token=gen_random_uuid(),crew_token=gen_random_uuid(),expires_at=now(),mail_pending=NULL WHERE work_order_id=NEW.id AND NOT (status='customer_pending' AND proposed_date=NEW.scheduled_date AND time_from=NEW.scheduled_from AND time_until=NEW.scheduled_until);
 END IF; RETURN NEW; END $$;