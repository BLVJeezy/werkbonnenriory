ALTER TABLE public.appointment_requests ADD COLUMN crew_slots jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.appointment_requests ADD COLUMN customer_slots jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.reset_appointment_options() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.mail_pending='crew' AND NEW.version IS DISTINCT FROM OLD.version THEN NEW.crew_slots='[]'::jsonb; NEW.customer_slots='[]'::jsonb; END IF; RETURN NEW; END $$;
CREATE TRIGGER reset_appointment_options BEFORE UPDATE ON public.appointment_requests FOR EACH ROW EXECUTE FUNCTION public.reset_appointment_options();
CREATE OR REPLACE FUNCTION public.respond_appointment_options(p_token uuid,p_action text,p_slots jsonb DEFAULT '[]'::jsonb,p_choice integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.appointment_requests; w public.work_orders; s jsonb; selected jsonb; rid uuid; options jsonb; BEGIN
 IF p_action NOT IN ('propose','accept','reject') THEN RAISE EXCEPTION 'Ongeldige actie'; END IF;
 SELECT * INTO r FROM public.appointment_requests WHERE (p_action='propose' AND crew_token=p_token) OR (p_action IN ('accept','reject') AND customer_token=p_token) FOR UPDATE;
 IF r.id IS NULL OR r.expires_at<now() THEN RAISE EXCEPTION 'Link ongeldig of verlopen'; END IF;
 SELECT * INTO w FROM public.work_orders WHERE id=r.work_order_id FOR UPDATE;
 IF w.technician_id IS DISTINCT FROM r.technician_id OR w.status='afgetekend' THEN RAISE EXCEPTION 'Afspraak niet meer beschikbaar'; END IF;
 IF p_action='accept' AND r.status='confirmed' THEN RETURN r.id; END IF;
 IF (p_action='propose' AND r.status<>'crew_pending') OR (p_action<>'propose' AND r.status<>'customer_pending') THEN RAISE EXCEPTION 'Voorstel niet meer beschikbaar'; END IF;
 IF jsonb_typeof(p_slots) IS DISTINCT FROM 'array' OR jsonb_array_length(p_slots)>10 THEN RAISE EXCEPTION 'Ongeldige tijdsvakken'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR coalesce(s->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(s->>'from','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(s->>'until','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Ongeldige datum of tijdsvak'; END IF;
  IF (s->>'date')::date<(now() AT TIME ZONE 'Europe/Brussels')::date OR (s->>'until')::time<=(s->>'from')::time THEN RAISE EXCEPTION 'Ongeldige datum of tijdsvak'; END IF;
 END LOOP;
 IF p_action='propose' THEN
  IF jsonb_array_length(p_slots)=0 THEN RAISE EXCEPTION 'Voeg een tijdsvak toe'; END IF;
  selected=p_slots->0;
  rid=public.respond_appointment(p_token,(selected->>'date')::date,(selected->>'from')::time,(selected->>'until')::time,NULL);
  UPDATE public.appointment_requests SET crew_slots=p_slots,customer_slots='[]'::jsonb WHERE id=rid;
 ELSIF p_action='reject' THEN
  rid=public.respond_appointment(p_token,NULL,NULL,NULL,false);
  UPDATE public.appointment_requests SET crew_slots='[]'::jsonb,customer_slots=p_slots WHERE id=rid;
 ELSE
  options=CASE WHEN jsonb_array_length(r.crew_slots)>0 THEN r.crew_slots ELSE jsonb_build_array(jsonb_build_object('date',r.proposed_date,'from',to_char(r.time_from,'HH24:MI'),'until',to_char(r.time_until,'HH24:MI'))) END;
  IF p_choice IS NULL OR p_choice<0 OR p_choice>=jsonb_array_length(options) THEN RAISE EXCEPTION 'Kies een voorgesteld tijdsvak'; END IF;
  selected=options->p_choice;
  UPDATE public.appointment_requests SET proposed_date=(selected->>'date')::date,time_from=(selected->>'from')::time,time_until=(selected->>'until')::time WHERE id=r.id;
  rid=public.respond_appointment(p_token,NULL,NULL,NULL,true);
 END IF;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.respond_appointment_options(uuid,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_appointment_options(uuid,text,jsonb,integer) TO service_role;