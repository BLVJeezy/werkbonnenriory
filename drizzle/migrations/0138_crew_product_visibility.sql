DROP TRIGGER IF EXISTS materials_crew_stock_ins ON public.materials;
DROP TRIGGER IF EXISTS materials_crew_stock_upd ON public.materials;
DROP TRIGGER IF EXISTS materials_crew_stock_del ON public.materials;
DROP FUNCTION IF EXISTS public.materials_crew_stock();
DROP FUNCTION IF EXISTS public.crew_stock_admin(uuid,uuid,text,numeric,text);
DROP FUNCTION IF EXISTS public.crew_stock_apply(uuid,uuid,numeric,text,uuid,uuid,text);
REVOKE ALL ON public.crew_stock, public.crew_stock_moves FROM authenticated;
COMMENT ON TABLE public.crew_stock IS 'DEPRECATED: replaced by crew_product_access (visibility, not stock)';
COMMENT ON TABLE public.crew_stock_moves IS 'DEPRECATED: replaced by crew_product_access (visibility, not stock)';
COMMENT ON COLUMN public.materials.from_crew_stock IS 'DEPRECATED: crew stock removed';
COMMENT ON COLUMN public.materials.stock_technician_id IS 'DEPRECATED: crew stock removed';

ALTER TABLE public.technicians ADD COLUMN product_scope text NOT NULL DEFAULT 'alle'
  CHECK (product_scope IN ('alle','gekozen'));
COMMENT ON COLUMN public.technicians.product_scope IS 'alle = every non-admin-only product (default, unchanged behaviour); gekozen = only products in crew_product_access';

CREATE TABLE public.crew_product_access (
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (technician_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.crew_product_access TO authenticated;
GRANT ALL ON public.crew_product_access TO service_role;
ALTER TABLE public.crew_product_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage" ON public.crew_product_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "crew read own" ON public.crew_product_access FOR SELECT TO authenticated
  USING (technician_id = public.my_technician_id());

CREATE OR REPLACE FUNCTION public.crew_product_allowed(p_product uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(),'admin') THEN true
    WHEN (SELECT admin_only FROM products WHERE id = p_product) IS NOT FALSE THEN false
    WHEN public.my_technician_id() IS NULL THEN true
    WHEN (SELECT product_scope FROM technicians WHERE id = public.my_technician_id()) = 'gekozen'
      THEN EXISTS (SELECT 1 FROM crew_product_access WHERE technician_id = public.my_technician_id() AND product_id = p_product)
    ELSE true END
$$;
REVOKE ALL ON FUNCTION public.crew_product_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_product_allowed(uuid) TO authenticated;

DROP POLICY "products read" ON public.products;
CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.crew_product_allowed(id));

CREATE OR REPLACE FUNCTION public.materials_product_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.product_id IS DISTINCT FROM OLD.product_id)
     AND NOT public.crew_product_allowed(NEW.product_id) THEN
    RAISE EXCEPTION 'Dit product is niet toegewezen aan deze ploeg';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER materials_product_guard BEFORE INSERT OR UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.materials_product_guard();