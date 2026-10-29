CREATE OR REPLACE FUNCTION public.is_admin_or_marketing() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketing')
$$;
CREATE POLICY "marketing read customers" ON public.customers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "marketing insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "marketing update customers" ON public.customers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'marketing')) WITH CHECK (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "marketing read projects" ON public.customer_projects FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "marketing campaigns" ON public.newsletter_campaigns FOR ALL TO authenticated USING (public.has_role(auth.uid(),'marketing')) WITH CHECK (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "marketing consent read" ON public.newsletter_consents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "marketing consent events read" ON public.newsletter_consent_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "marketing photos read" ON public.work_order_photos FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'marketing'));
CREATE POLICY "werkbon fotos marketing read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'werkbon-fotos' AND public.has_role(auth.uid(),'marketing'));
CREATE OR REPLACE FUNCTION public.photo_overview() RETURNS TABLE(id uuid, path text, created_at timestamptz, work_order_id uuid, number integer, customer_name text, city text, scheduled_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.path, p.created_at, p.work_order_id, w.number, w.customer_name, coalesce(w.site_city, w.city), w.scheduled_date
  FROM public.work_order_photos p JOIN public.work_orders w ON w.id = p.work_order_id
  WHERE public.is_admin_or_marketing()
  ORDER BY p.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.photo_overview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.photo_overview() TO authenticated;
CREATE OR REPLACE FUNCTION public.record_newsletter_consent(p_customer_id uuid, p_status text, p_evidence text, p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
 IF NOT public.is_admin_or_marketing() THEN RAISE EXCEPTION 'Alleen beheerder of marketing'; END IF;
 IF p_status NOT IN ('subscribed','unsubscribed') OR length(trim(p_evidence)) NOT BETWEEN 3 AND 2000 OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Ongeldige toestemming'; END IF;
 SELECT lower(trim(email)) INTO v_email FROM public.customers WHERE id=p_customer_id FOR UPDATE;
 IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Geldig klantmailadres vereist'; END IF;
 INSERT INTO public.newsletter_consents(customer_id,email,status,evidence,consent_at,unsubscribe_hash) VALUES (p_customer_id,v_email,p_status,trim(p_evidence),CASE WHEN p_status='subscribed' THEN now() ELSE NULL END,p_hash)
 ON CONFLICT(customer_id) DO UPDATE SET email=EXCLUDED.email,status=EXCLUDED.status,evidence=EXCLUDED.evidence,consent_at=EXCLUDED.consent_at,unsubscribe_hash=EXCLUDED.unsubscribe_hash,updated_at=now();
 INSERT INTO public.newsletter_consent_events(customer_id,email,status,evidence,actor_id) VALUES (p_customer_id,v_email,p_status,trim(p_evidence),auth.uid());
END $$;