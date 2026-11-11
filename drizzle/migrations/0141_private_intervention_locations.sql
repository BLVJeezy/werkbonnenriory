CREATE TABLE public.intervention_locations (
 address_key text PRIMARY KEY, address text NOT NULL, lat double precision, lon double precision,
 state text NOT NULL DEFAULT 'missing' CHECK (state IN ('missing','located','failed','processing')),
 source text, error text, updated_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 CHECK ((lat IS NULL AND lon IS NULL) OR (lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180)),
 CHECK (state <> 'located' OR (lat IS NOT NULL AND lon IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.intervention_locations TO authenticated;
GRANT ALL ON public.intervention_locations TO service_role;
ALTER TABLE public.intervention_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY intervention_admin_only ON public.intervention_locations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.intervention_geocode_budget (
 id integer PRIMARY KEY CHECK (id = 1), day date NOT NULL DEFAULT current_date, used integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.intervention_geocode_budget TO authenticated;
GRANT ALL ON public.intervention_geocode_budget TO service_role;
ALTER TABLE public.intervention_geocode_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY intervention_budget_admin_only ON public.intervention_geocode_budget FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.claim_intervention_geocode(p_key text,p_address text,p_budget integer) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.intervention_geocode_budget; l public.intervention_locations;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF p_budget < 1 OR p_budget > 1000 THEN RETURN 'disabled'; END IF;
 INSERT INTO public.intervention_geocode_budget(id) VALUES (1) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.intervention_geocode_budget WHERE id=1 FOR UPDATE;
 IF b.day <> current_date THEN b.used := 0; END IF;
 IF b.used >= p_budget THEN RETURN 'budget'; END IF;
 IF b.next_at > now() THEN RETURN 'throttled'; END IF;
 INSERT INTO public.intervention_locations(address_key,address) VALUES (p_key,p_address) ON CONFLICT DO NOTHING;
 SELECT * INTO l FROM public.intervention_locations WHERE address_key=p_key FOR UPDATE;
 IF l.state='located' THEN RETURN 'cached'; END IF;
 IF l.lease_until > now() THEN RETURN 'busy'; END IF;
 UPDATE public.intervention_geocode_budget SET day=current_date,used=b.used+1,next_at=now()+interval '1200 milliseconds' WHERE id=1;
 UPDATE public.intervention_locations SET state='processing',lease_until=now()+interval '60 seconds',updated_at=now() WHERE address_key=p_key;
 RETURN 'claimed';
END $$;
REVOKE ALL ON FUNCTION public.claim_intervention_geocode(text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_intervention_geocode(text,text,integer) TO authenticated;
COMMENT ON TABLE public.intervention_locations IS 'Admin-only intervention destination cache; never invoice-address history or public dataset.';