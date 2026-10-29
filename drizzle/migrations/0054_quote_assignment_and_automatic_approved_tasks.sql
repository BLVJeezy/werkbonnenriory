ALTER TABLE public.quotes ADD COLUMN technician_id uuid REFERENCES public.technicians(id);
ALTER TABLE public.work_orders ADD COLUMN quote_approved boolean NOT NULL DEFAULT false;
UPDATE public.quotes q SET technician_id=w.technician_id FROM public.work_orders w WHERE w.id=q.source_work_order_id;
CREATE OR REPLACE FUNCTION public.guard_quote_task_visibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 NEW.quote_pending := EXISTS(SELECT 1 FROM public.quotes q WHERE q.source_work_order_id=NEW.id OR(q.work_order_id=NEW.id AND q.status<>'akkoord'));
 NEW.quote_approved := EXISTS(SELECT 1 FROM public.quotes q WHERE q.work_order_id=NEW.id AND q.status='akkoord');
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.ensure_approved_quote_task(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.quotes%ROWTYPE; s public.work_orders%ROWTYPE; task_id uuid; description_text text;
BEGIN
 SELECT * INTO q FROM public.quotes WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Offerte niet gevonden'; END IF;
 IF q.status<>'akkoord' THEN RAISE EXCEPTION 'De klant heeft deze offerte nog niet goedgekeurd'; END IF;
 IF q.work_order_id IS NOT NULL THEN RETURN q.work_order_id; END IF;
 SELECT * INTO s FROM public.work_orders WHERE id=q.source_work_order_id;
 SELECT string_agg('- '||(l->>'description')||': '||(l->>'quantity')||' '||(l->>'unit'), E'\n') INTO description_text FROM jsonb_array_elements(q.lines) l;
 INSERT INTO public.work_orders(customer_name,street,house_number,postal_code,city,address,email,billing_email,vat_number,vat_rate,description,technician_id,status,phone,activity_id,customer_id,project_id,project_name,use_site_address,site_street,site_house_number,site_postal_code,site_city,site_contact_name,site_contact_phone,distance_km,urgent)
 VALUES(q.customer->>'name',q.customer->>'street',q.customer->>'houseNumber',q.customer->>'postalCode',q.customer->>'city',q.customer->>'address',COALESCE(s.email,q.customer->>'email'),q.customer->>'email',q.customer->>'vatNumber',q.vat_rate,'Offerte '||q.number||' (goedgekeurd):'||E'\n'||COALESCE(description_text,''),q.technician_id,CASE WHEN q.technician_id IS NULL THEN 'nieuw' ELSE 'toegewezen' END,s.phone,s.activity_id,s.customer_id,s.project_id,s.project_name,COALESCE(s.use_site_address,false),s.site_street,s.site_house_number,s.site_postal_code,s.site_city,s.site_contact_name,s.site_contact_phone,s.distance_km,COALESCE(s.urgent,false)) RETURNING id INTO task_id;
 UPDATE public.quotes SET work_order_id=task_id WHERE id=q.id;
 RETURN task_id;
END $$;
REVOKE ALL ON FUNCTION public.ensure_approved_quote_task(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_approved_quote_task(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.approve_quote_planning() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status='akkoord' AND NEW.work_order_id IS NULL THEN PERFORM public.ensure_approved_quote_task(NEW.id); END IF;
 IF NEW.work_order_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.technician_id IS DISTINCT FROM OLD.technician_id) THEN UPDATE public.work_orders SET technician_id=NEW.technician_id,status=CASE WHEN status='afgetekend' THEN status WHEN NEW.technician_id IS NULL THEN 'nieuw' ELSE 'toegewezen' END WHERE id=NEW.work_order_id; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER quote_approved_planning AFTER INSERT OR UPDATE OF status,technician_id ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.approve_quote_planning();
CREATE OR REPLACE FUNCTION public.convert_approved_quote(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 RETURN public.ensure_approved_quote_task(p_id);
END $$;
REVOKE ALL ON FUNCTION public.convert_approved_quote(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convert_approved_quote(uuid) TO authenticated;
UPDATE public.work_orders SET quote_approved=false WHERE id IN(SELECT work_order_id FROM public.quotes WHERE work_order_id IS NOT NULL);