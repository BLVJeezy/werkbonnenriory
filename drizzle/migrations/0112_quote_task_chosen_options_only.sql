CREATE OR REPLACE FUNCTION public.ensure_approved_quote_task(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE q public.quotes%ROWTYPE; s public.work_orders%ROWTYPE; task_id uuid; description_text text; skipped_text text;
BEGIN
 SELECT * INTO q FROM public.quotes WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Offerte niet gevonden'; END IF;
 IF q.status<>'akkoord' THEN RAISE EXCEPTION 'De klant heeft deze offerte nog niet goedgekeurd'; END IF;
 IF q.work_order_id IS NOT NULL THEN RETURN q.work_order_id; END IF;
 SELECT * INTO s FROM public.work_orders WHERE id=q.source_work_order_id;
 SELECT string_agg('- '||(l->>'description')||': '||(l->>'quantity')||' '||COALESCE(l->>'unit',''), E'\n') INTO description_text FROM jsonb_array_elements(q.lines) l WHERE COALESCE((l->>'optional')::boolean,false)=false;
 SELECT string_agg('- '||split_part(l->>'description',E'\n',1), E'\n') INTO skipped_text FROM jsonb_array_elements(q.lines) l WHERE COALESCE((l->>'optional')::boolean,false)=true;
 INSERT INTO public.work_orders(customer_name,street,house_number,postal_code,city,address,email,billing_email,vat_number,vat_rate,description,technician_id,status,phone,activity_id,customer_id,project_id,project_name,use_site_address,site_street,site_house_number,site_postal_code,site_city,site_contact_name,site_contact_phone,distance_km,urgent)
 VALUES(q.customer->>'name',q.customer->>'street',q.customer->>'houseNumber',q.customer->>'postalCode',q.customer->>'city',q.customer->>'address',COALESCE(s.email,q.customer->>'email'),q.customer->>'email',q.customer->>'vatNumber',q.vat_rate,
  'Offerte '||q.number||' (goedgekeurd)'||E'\n\n'||'UIT TE VOEREN (nodig voor het werk):'||E'\n'||COALESCE(description_text,'-')||CASE WHEN skipped_text IS NOT NULL THEN E'\n\n'||'NIET GEKOZEN DOOR KLANT — NIET UITVOEREN:'||E'\n'||skipped_text ELSE '' END,
  q.technician_id,CASE WHEN q.technician_id IS NULL THEN 'nieuw' ELSE 'toegewezen' END,s.phone,s.activity_id,s.customer_id,s.project_id,s.project_name,COALESCE(s.use_site_address,false),s.site_street,s.site_house_number,s.site_postal_code,s.site_city,s.site_contact_name,s.site_contact_phone,s.distance_km,COALESCE(s.urgent,false)) RETURNING id INTO task_id;
 UPDATE public.quotes SET work_order_id=task_id WHERE id=q.id;
 RETURN task_id;
END $function$;
REVOKE ALL ON FUNCTION public.ensure_approved_quote_task(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_approved_quote_task(uuid) TO service_role;