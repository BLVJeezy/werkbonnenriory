CREATE OR REPLACE FUNCTION public.claim_intervention_geocode(p_key text, p_address text, p_budget integer)
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE b public.intervention_geocode_budget; l public.intervention_locations;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF p_budget < 1 OR p_budget > 5000 THEN RETURN 'disabled'; END IF;
 INSERT INTO public.intervention_geocode_budget(id) VALUES (1) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.intervention_geocode_budget WHERE id=1 FOR UPDATE;
 IF b.day <> current_date THEN b.used := 0; END IF;
 IF b.used >= p_budget THEN RETURN 'budget'; END IF;
 IF b.next_at > now() THEN RETURN 'throttled'; END IF;
 INSERT INTO public.intervention_locations(address_key,address) VALUES (p_key,p_address) ON CONFLICT DO NOTHING;
 SELECT * INTO l FROM public.intervention_locations WHERE address_key=p_key FOR UPDATE;
 IF l.state='located' THEN RETURN 'cached'; END IF;
 IF l.lease_until > now() THEN RETURN 'busy'; END IF;
 UPDATE public.intervention_geocode_budget SET day=current_date,used=b.used+1,next_at=now()+interval '200 milliseconds' WHERE id=1;
 UPDATE public.intervention_locations SET state='processing',lease_until=now()+interval '60 seconds',updated_at=now() WHERE address_key=p_key;
 RETURN 'claimed';
END $function$;