CREATE TABLE public.newsletter_consents (
 customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
 email text NOT NULL,
 status text NOT NULL CHECK (status IN ('subscribed','unsubscribed')),
 evidence text NOT NULL DEFAULT '',
 consent_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 unsubscribe_hash text UNIQUE NOT NULL
);
GRANT SELECT ON public.newsletter_consents TO authenticated;
GRANT ALL ON public.newsletter_consents TO service_role;
ALTER TABLE public.newsletter_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_consent_admin_read ON public.newsletter_consents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TABLE public.newsletter_consent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
 email text NOT NULL,
 status text NOT NULL CHECK (status IN ('subscribed','unsubscribed')),
 evidence text NOT NULL,
 actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.newsletter_consent_events TO authenticated;
GRANT ALL ON public.newsletter_consent_events TO service_role;
ALTER TABLE public.newsletter_consent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_event_admin_read ON public.newsletter_consent_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TABLE public.newsletter_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
 subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 30000),
 status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_campaigns TO authenticated;
GRANT ALL ON public.newsletter_campaigns TO service_role;
ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_campaign_admin ON public.newsletter_campaigns FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.record_newsletter_consent(p_customer_id uuid, p_status text, p_evidence text, p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Alleen beheerder'; END IF;
 IF p_status NOT IN ('subscribed','unsubscribed') OR length(trim(p_evidence)) NOT BETWEEN 3 AND 2000 OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Ongeldige toestemming'; END IF;
 SELECT lower(trim(email)) INTO v_email FROM public.customers WHERE id=p_customer_id FOR UPDATE;
 IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Geldig klantmailadres vereist'; END IF;
 INSERT INTO public.newsletter_consents(customer_id,email,status,evidence,consent_at,unsubscribe_hash) VALUES (p_customer_id,v_email,p_status,trim(p_evidence),CASE WHEN p_status='subscribed' THEN now() ELSE NULL END,p_hash)
 ON CONFLICT(customer_id) DO UPDATE SET email=EXCLUDED.email,status=EXCLUDED.status,evidence=EXCLUDED.evidence,consent_at=EXCLUDED.consent_at,unsubscribe_hash=EXCLUDED.unsubscribe_hash,updated_at=now();
 INSERT INTO public.newsletter_consent_events(customer_id,email,status,evidence,actor_id) VALUES (p_customer_id,v_email,p_status,trim(p_evidence),auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.record_newsletter_consent(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_newsletter_consent(uuid,text,text,text) TO authenticated;
CREATE FUNCTION public.unsubscribe_newsletter(p_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
 SELECT email INTO v_email FROM public.newsletter_consents WHERE unsubscribe_hash=p_hash;
 IF v_email IS NULL THEN RETURN false; END IF;
 WITH changed AS (UPDATE public.newsletter_consents SET status='unsubscribed', updated_at=now(), evidence='Uitgeschreven via persoonlijke link' WHERE email=v_email AND status='subscribed' RETURNING customer_id,email)
 INSERT INTO public.newsletter_consent_events(customer_id,email,status,evidence) SELECT customer_id,email,'unsubscribed','Uitgeschreven via persoonlijke link' FROM changed;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.unsubscribe_newsletter(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter(text) TO service_role;