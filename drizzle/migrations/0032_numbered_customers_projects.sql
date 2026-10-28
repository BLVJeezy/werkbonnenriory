CREATE OR REPLACE FUNCTION public.customer_identity(n text,s text,h text,p text,c text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT regexp_replace(translate(lower(coalesce(n,'')), 'àáâäãåéèêëíìîïóòôöõúùûüçñ','aaaaaaeeeeiiiiooooouuuucn'),'[^a-z0-9]','','g') || '|' || regexp_replace(translate(lower(coalesce(s,'')||coalesce(h,'')), 'àáâäãåéèêëíìîïóòôöõúùûüçñ','aaaaaaeeeeiiiiooooouuuucn'),'[^a-z0-9]','','g') || '|' || regexp_replace(lower(coalesce(p,'')),'[^a-z0-9]','','g') || CASE WHEN nullif(trim(coalesce(p,'')),'') IS NULL THEN '|'||regexp_replace(lower(coalesce(c,'')),'[^a-z0-9]','','g') ELSE '' END $$;
ALTER TABLE public.customers ADD COLUMN customer_number text, ADD COLUMN customer_numbers text[] NOT NULL DEFAULT '{}', ADD COLUMN default_vat_rate numeric, ADD COLUMN identity_key text GENERATED ALWAYS AS (public.customer_identity(name,street,house_number,postal_code,city)) STORED;
DROP INDEX public.customers_match_key_idx;
CREATE UNIQUE INDEX customers_identity_key_idx ON public.customers(identity_key);
COMMENT ON COLUMN public.customers.match_key IS 'DEPRECATED: replaced by identity_key (name and full address)';
CREATE TABLE public.customer_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id), number text, name text NOT NULL, street text, house_number text, postal_code text, city text, description text, reference text, status text, import_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.customer_projects TO authenticated;
GRANT ALL ON public.customer_projects TO service_role;
ALTER TABLE public.customer_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin projects" ON public.customer_projects FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
ALTER TABLE public.work_orders ADD COLUMN customer_id uuid REFERENCES public.customers(id), ADD COLUMN project_id uuid REFERENCES public.customer_projects(id);
CREATE OR REPLACE FUNCTION public.resolve_task_customer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; pr uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
 IF NEW.customer_name IS NULL OR trim(NEW.customer_name)='' OR lower(trim(NEW.customer_name))='onbekend' THEN RETURN NEW; END IF;
 SELECT id INTO cid FROM public.customers WHERE identity_key=public.customer_identity(NEW.customer_name,NEW.street,NEW.house_number,NEW.postal_code,NEW.city);
 IF cid IS NULL AND NEW.customer_id IS NOT NULL THEN SELECT id INTO cid FROM public.customers WHERE id=NEW.customer_id AND public.customer_identity(name,street,house_number,postal_code,city)=public.customer_identity(NEW.customer_name,NEW.street,NEW.house_number,NEW.postal_code,NEW.city); END IF;
 IF cid IS NULL THEN
 INSERT INTO public.customers(name,street,house_number,postal_code,city,phone,email,billing_email,vat_number) VALUES(NEW.customer_name,NEW.street,NEW.house_number,NEW.postal_code,NEW.city,NEW.phone,NEW.email,NEW.billing_email,NEW.vat_number) ON CONFLICT(identity_key) DO UPDATE SET name=public.customers.name RETURNING id INTO cid;
 END IF;
 NEW.customer_id=cid;
 IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer_projects WHERE id=NEW.project_id AND customer_id=cid) THEN NEW.project_id=NULL; END IF;
 IF NEW.project_id IS NULL AND nullif(trim(NEW.project_name),'') IS NOT NULL THEN
 SELECT min(id::text)::uuid INTO pr FROM public.customer_projects WHERE customer_id=cid AND lower(trim(name))=lower(trim(NEW.project_name)) HAVING count(*)=1; NEW.project_id=pr;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.resolve_task_customer() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER work_order_customer_link BEFORE INSERT OR UPDATE OF customer_name,street,house_number,postal_code,city,customer_id,project_name,project_id ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.resolve_task_customer();
UPDATE public.work_orders w SET customer_id=c.id FROM public.customers c WHERE w.customer_id IS NULL AND c.identity_key=public.customer_identity(w.customer_name,w.street,w.house_number,w.postal_code,w.city);