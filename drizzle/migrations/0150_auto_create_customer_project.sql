CREATE OR REPLACE FUNCTION public.resolve_task_customer()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cid uuid; pr uuid; s text; h text; p text; c text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
 IF NEW.customer_name IS NULL OR trim(NEW.customer_name)='' OR lower(trim(NEW.customer_name))='onbekend' THEN RETURN NEW; END IF;
 SELECT id INTO cid FROM public.customers WHERE identity_key=public.customer_identity(NEW.customer_name,NEW.street,NEW.house_number,NEW.postal_code,NEW.city);
 IF cid IS NULL AND NEW.customer_id IS NOT NULL THEN SELECT id INTO cid FROM public.customers WHERE id=NEW.customer_id AND public.customer_identity(name,street,house_number,postal_code,city)=public.customer_identity(NEW.customer_name,NEW.street,NEW.house_number,NEW.postal_code,NEW.city); END IF;
 IF cid IS NULL THEN
 INSERT INTO public.customers(name,street,house_number,postal_code,city,phone,email,billing_email,vat_number,syndicus) VALUES(NEW.customer_name,NEW.street,NEW.house_number,NEW.postal_code,NEW.city,NEW.phone,NEW.email,NEW.billing_email,NEW.vat_number,nullif(trim(NEW.syndicus),'')) ON CONFLICT(identity_key) DO UPDATE SET name=public.customers.name RETURNING id INTO cid;
 END IF;
 IF nullif(trim(NEW.syndicus),'') IS NOT NULL THEN
 UPDATE public.customers SET syndicus=trim(NEW.syndicus) WHERE id=cid AND syndicus IS DISTINCT FROM trim(NEW.syndicus);
 END IF;
 NEW.customer_id=cid;
 IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer_projects WHERE id=NEW.project_id AND customer_id=cid) THEN NEW.project_id=NULL; END IF;
 IF NEW.project_id IS NULL AND nullif(trim(NEW.project_name),'') IS NOT NULL THEN
 SELECT min(id::text)::uuid INTO pr FROM public.customer_projects WHERE customer_id=cid AND lower(trim(name))=lower(trim(NEW.project_name)) HAVING count(*)=1;
 IF pr IS NULL AND NOT EXISTS(SELECT 1 FROM public.customer_projects WHERE customer_id=cid AND lower(trim(name))=lower(trim(NEW.project_name))) THEN
 IF NEW.use_site_address AND nullif(trim(coalesce(NEW.site_street,'')),'') IS NOT NULL THEN
 s := trim(NEW.site_street); h := nullif(trim(coalesce(NEW.site_house_number,'')),''); p := nullif(trim(coalesce(NEW.site_postal_code,'')),''); c := nullif(trim(coalesce(NEW.site_city,'')),'');
 ELSE
 s := nullif(trim(coalesce(NEW.street,'')),''); h := nullif(trim(coalesce(NEW.house_number,'')),''); p := nullif(trim(coalesce(NEW.postal_code,'')),''); c := nullif(trim(coalesce(NEW.city,'')),'');
 END IF;
 INSERT INTO public.customer_projects(customer_id,name,street,house_number,postal_code,city,status,import_key)
 VALUES (cid, trim(NEW.project_name), s, h, p, c, 'lopend', 'app:' || cid::text || ':' || md5(lower(trim(NEW.project_name))))
 ON CONFLICT (import_key) DO UPDATE SET name = EXCLUDED.name
 RETURNING id INTO pr;
 END IF;
 NEW.project_id=pr;
 END IF;
 RETURN NEW;
END $function$;