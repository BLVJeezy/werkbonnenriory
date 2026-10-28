-- Klant uitnodigen door de beheerder: de app legt de gekozen standaardvakken vast en mailt de klant een keuzelink.
CREATE OR REPLACE FUNCTION public.login_email(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN position('@' IN coalesce(p_name,''))>0 THEN lower(trim(p_name))
    ELSE regexp_replace(regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','-','g'),'^-+|-+$','','g') || '@ploeg.riory.local'
  END;
$$;
COMMENT ON FUNCTION public.login_email(text) IS 'Interne login voor een ploegnaam; eindigt op @ploeg.riory.local en is bewust niet verstuurbaar.';
REVOKE ALL ON FUNCTION public.login_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.login_email(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invite_customer_appointment(p_id uuid, p_slots jsonb, p_instruction text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.work_orders; t public.technicians; s jsonb; r_id uuid; first_slot jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
  IF jsonb_typeof(p_slots) IS DISTINCT FROM 'array' OR jsonb_array_length(p_slots)<1 OR jsonb_array_length(p_slots)>10 THEN RAISE EXCEPTION 'Kies een tot tien tijdsvakken'; END IF;
  IF length(trim(coalesce(p_instruction,'')))<1 OR length(p_instruction)>4000 THEN RAISE EXCEPTION 'Werkomschrijving ontbreekt'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
    IF jsonb_typeof(s) IS DISTINCT FROM 'object'
       OR coalesce(s->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(s->>'from','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR coalesce(s->>'until','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Ongeldige datum of tijdsvak'; END IF;
    IF (s->>'date')::date < (now() AT TIME ZONE 'Europe/Brussels')::date OR (s->>'until')::time <= (s->>'from')::time THEN RAISE EXCEPTION 'Ongeldige datum of tijdsvak'; END IF;
  END LOOP;
  SELECT * INTO w FROM public.work_orders WHERE id=p_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Taak niet gevonden'; END IF;
  IF w.status='afgetekend' THEN RAISE EXCEPTION 'Deze taak is afgerond'; END IF;
  IF w.email IS NULL OR position('@' IN w.email)=0 THEN RAISE EXCEPTION 'De klant heeft geen geldig e-mailadres'; END IF;
  IF w.technician_id IS NULL THEN RAISE EXCEPTION 'Wijs eerst een ploeg toe aan deze taak'; END IF;
  SELECT * INTO t FROM public.technicians WHERE id=w.technician_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Ploeg niet gevonden'; END IF;
  first_slot := p_slots->0;
  INSERT INTO public.appointment_requests(work_order_id,technician_id,customer_email,crew_email,instruction,status,crew_slots,customer_slots,proposed_date,time_from,time_until,customer_token,crew_token,expires_at,mail_pending)
  VALUES (w.id,w.technician_id,w.email,coalesce(nullif(trim(t.email),''),public.login_email(t.name)),trim(p_instruction),'customer_pending',p_slots,'[]'::jsonb,
          (first_slot->>'date')::date,(first_slot->>'from')::time,(first_slot->>'until')::time,gen_random_uuid(),gen_random_uuid(),now()+interval '30 days','customer')
  ON CONFLICT(work_order_id) DO UPDATE SET technician_id=excluded.technician_id,customer_email=excluded.customer_email,crew_email=excluded.crew_email,
          instruction=excluded.instruction,status='customer_pending',crew_slots=excluded.crew_slots,customer_slots='[]'::jsonb,
          proposed_date=excluded.proposed_date,time_from=excluded.time_from,time_until=excluded.time_until,
          customer_token=gen_random_uuid(),crew_token=gen_random_uuid(),expires_at=now()+interval '30 days',confirmed_at=NULL,
          mail_pending='customer',mail_error=NULL,mail_sent_at=NULL,mail_lock_until=NULL,version=appointment_requests.version+1
  RETURNING id INTO r_id;
  RETURN r_id;
END $$;
REVOKE ALL ON FUNCTION public.invite_customer_appointment(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_customer_appointment(uuid,jsonb,text) TO authenticated;