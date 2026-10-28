ALTER TABLE public.technicians ADD COLUMN external_planning boolean NOT NULL DEFAULT false;
ALTER TABLE public.technicians ADD CONSTRAINT external_crew_no_account CHECK (NOT external_planning OR (user_id IS NULL AND NOT show_prices AND NOT can_payment));
ALTER TABLE public.work_orders ADD COLUMN scheduled_from time;
ALTER TABLE public.work_orders ADD COLUMN scheduled_until time;
CREATE TABLE public.appointment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL UNIQUE REFERENCES public.work_orders(id) ON DELETE CASCADE, technician_id uuid NOT NULL REFERENCES public.technicians(id), crew_token uuid NOT NULL DEFAULT gen_random_uuid(), customer_token uuid NOT NULL DEFAULT gen_random_uuid(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', status text NOT NULL DEFAULT 'crew_pending' CHECK(status IN ('crew_pending','customer_pending','confirmed')), proposed_date date, time_from time, time_until time, customer_email text NOT NULL, crew_email text NOT NULL, instruction text NOT NULL, version integer NOT NULL DEFAULT 1, mail_pending text, mail_sent_at timestamptz, mail_error text, mail_lock_until timestamptz, confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.appointment_requests TO authenticated;
GRANT ALL ON public.appointment_requests TO service_role;
ALTER TABLE public.appointment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointment_admin ON public.appointment_requests FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.respond_appointment(p_token uuid,p_date date DEFAULT NULL,p_from time DEFAULT NULL,p_until time DEFAULT NULL,p_accept boolean DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.appointment_requests; w public.work_orders;
BEGIN
 SELECT * INTO r FROM public.appointment_requests WHERE (p_accept IS NULL AND crew_token=p_token) OR (p_accept IS NOT NULL AND customer_token=p_token) FOR UPDATE;
 IF r.id IS NULL OR r.expires_at<now() THEN RAISE EXCEPTION 'Link ongeldig of verlopen'; END IF;
 SELECT * INTO w FROM public.work_orders WHERE id=r.work_order_id FOR UPDATE;
 IF w.technician_id IS DISTINCT FROM r.technician_id OR w.status='afgetekend' THEN RAISE EXCEPTION 'Afspraak niet meer beschikbaar'; END IF;
 IF p_accept IS NULL THEN
  IF r.status<>'crew_pending' THEN RAISE EXCEPTION 'Voorstel reeds ingestuurd'; END IF;
  IF p_date IS NULL OR p_date<(now() AT TIME ZONE 'Europe/Brussels')::date OR p_from IS NULL OR p_until IS NULL OR p_until<=p_from THEN RAISE EXCEPTION 'Ongeldige datum of tijdsvak'; END IF;
  UPDATE public.appointment_requests SET proposed_date=p_date,time_from=p_from,time_until=p_until,status='customer_pending',customer_token=gen_random_uuid(),mail_pending='customer',mail_sent_at=NULL,mail_error=NULL,mail_lock_until=NULL,version=version+1 WHERE id=r.id;
 ELSE
  IF r.status='confirmed' AND p_accept THEN RETURN r.id; END IF;
  IF r.status<>'customer_pending' THEN RAISE EXCEPTION 'Voorstel niet meer beschikbaar'; END IF;
  IF r.proposed_date<(now() AT TIME ZONE 'Europe/Brussels')::date THEN RAISE EXCEPTION 'Voorgestelde datum is voorbij'; END IF;
  IF p_accept THEN
   UPDATE public.work_orders SET scheduled_date=r.proposed_date,scheduled_from=r.time_from,scheduled_until=r.time_until,sort_order=(SELECT coalesce(max(sort_order),0)+1 FROM public.work_orders WHERE scheduled_date=r.proposed_date) WHERE id=w.id;
   UPDATE public.appointment_requests SET status='confirmed',confirmed_at=now(),mail_pending='confirmed',mail_sent_at=NULL,mail_error=NULL,mail_lock_until=NULL,version=version+1 WHERE id=r.id;
  ELSE
   UPDATE public.appointment_requests SET status='crew_pending',crew_token=gen_random_uuid(),customer_token=gen_random_uuid(),proposed_date=NULL,time_from=NULL,time_until=NULL,mail_pending='rejected',mail_sent_at=NULL,mail_error=NULL,mail_lock_until=NULL,version=version+1 WHERE id=r.id;
  END IF;
 END IF;
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.respond_appointment(uuid,date,time,time,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_appointment(uuid,date,time,time,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.invalidate_appointment_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.technician_id IS DISTINCT FROM OLD.technician_id OR (NEW.status='afgetekend' AND OLD.status<>'afgetekend') THEN
 DELETE FROM public.appointment_requests WHERE work_order_id=NEW.id;
 ELSIF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.scheduled_from IS DISTINCT FROM OLD.scheduled_from OR NEW.scheduled_until IS DISTINCT FROM OLD.scheduled_until THEN
 UPDATE public.appointment_requests SET customer_token=gen_random_uuid(),crew_token=gen_random_uuid(),expires_at=now(),mail_pending=NULL WHERE work_order_id=NEW.id;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER invalidate_appointment_assignment AFTER UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.invalidate_appointment_assignment();