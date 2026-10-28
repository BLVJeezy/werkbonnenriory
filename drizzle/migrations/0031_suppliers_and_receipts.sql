CREATE TABLE public.suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, vat_number text, iban text,
 match_key text NOT NULL UNIQUE,
 payment_method text NOT NULL DEFAULT 'overschrijving' CHECK (payment_method IN ('overschrijving','domiciliering','kaart','cash')),
 vat_rule text NOT NULL DEFAULT 'document' CHECK (vat_rule IN ('document','0','6','12','21','verlegd','vrijgesteld')),
 vat_deductible_percent numeric NOT NULL DEFAULT 100 CHECK (vat_deductible_percent BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins beheren leveranciers" ON public.suppliers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
ALTER TABLE public.purchase_invoices ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id), ADD COLUMN payment_method text NOT NULL DEFAULT 'overschrijving', ADD COLUMN supplier_vat_rule text NOT NULL DEFAULT 'document', ADD COLUMN vat_deductible_percent numeric NOT NULL DEFAULT 100, ADD COLUMN upload_hash text;
CREATE UNIQUE INDEX purchase_upload_hash_unique ON public.purchase_invoices(upload_hash) WHERE upload_hash IS NOT NULL;
CREATE OR REPLACE FUNCTION public.link_purchase_supplier() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; s public.suppliers;
BEGIN
 IF trim(NEW.supplier_name) = '' OR lower(trim(NEW.supplier_name)) = 'onbekend' THEN RETURN NEW; END IF;
 k := CASE WHEN nullif(regexp_replace(upper(coalesce(NEW.supplier_vat,'')), '[^A-Z0-9]', '', 'g'),'') IS NOT NULL THEN 'vat:' || regexp_replace(upper(NEW.supplier_vat), '[^A-Z0-9]', '', 'g') ELSE 'name:' || lower(regexp_replace(trim(NEW.supplier_name), '\s+', ' ', 'g')) END;
 SELECT * INTO s FROM public.suppliers WHERE match_key = k;
 IF s.id IS NULL AND nullif(trim(NEW.supplier_vat),'') IS NOT NULL THEN
 SELECT * INTO s FROM public.suppliers WHERE match_key = 'name:' || lower(regexp_replace(trim(NEW.supplier_name), '\s+', ' ', 'g'));
 IF s.id IS NOT NULL THEN UPDATE public.suppliers SET match_key=k, vat_number=NEW.supplier_vat WHERE id=s.id RETURNING * INTO s; END IF;
 END IF;
 IF s.id IS NULL THEN
 INSERT INTO public.suppliers(name,vat_number,iban,match_key) VALUES(NEW.supplier_name,NEW.supplier_vat,NEW.supplier_iban,k) ON CONFLICT(match_key) DO UPDATE SET match_key=EXCLUDED.match_key RETURNING * INTO s;
 END IF;
 NEW.supplier_id := s.id;
 IF TG_OP = 'INSERT' THEN NEW.payment_method := s.payment_method; NEW.supplier_vat_rule := s.vat_rule; NEW.vat_deductible_percent := s.vat_deductible_percent; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER purchase_supplier_link BEFORE INSERT OR UPDATE OF supplier_name,supplier_vat,supplier_iban ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.link_purchase_supplier();
UPDATE public.purchase_invoices SET supplier_name=supplier_name WHERE supplier_id IS NULL;
UPDATE public.purchase_invoices p SET payment_method=s.payment_method, supplier_vat_rule=s.vat_rule, vat_deductible_percent=s.vat_deductible_percent FROM public.suppliers s WHERE p.supplier_id=s.id;
REVOKE ALL ON FUNCTION public.link_purchase_supplier() FROM PUBLIC, anon, authenticated;