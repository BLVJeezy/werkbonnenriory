CREATE TABLE public.crew_stock (
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (technician_id, product_id)
);
GRANT SELECT ON public.crew_stock TO authenticated;
GRANT ALL ON public.crew_stock TO service_role;
ALTER TABLE public.crew_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock read" ON public.crew_stock FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR technician_id = public.my_technician_id());

CREATE TABLE public.crew_stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  balance_after numeric NOT NULL,
  kind text NOT NULL CHECK (kind IN ('toewijzing','terugname','correctie','verbruik','verbruik_terug')),
  work_order_id uuid,
  material_id uuid,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crew_stock_moves_tech_idx ON public.crew_stock_moves(technician_id, created_at DESC);
GRANT SELECT ON public.crew_stock_moves TO authenticated;
GRANT ALL ON public.crew_stock_moves TO service_role;
ALTER TABLE public.crew_stock_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moves read" ON public.crew_stock_moves FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR technician_id = public.my_technician_id());

ALTER TABLE public.materials ADD COLUMN from_crew_stock boolean NOT NULL DEFAULT false;
ALTER TABLE public.materials ADD COLUMN stock_technician_id uuid;

-- Internal: apply a delta to one crew/product balance under a row lock; never below zero.
CREATE OR REPLACE FUNCTION public.crew_stock_apply(p_tech uuid, p_product uuid, p_delta numeric, p_kind text, p_wo uuid, p_material uuid, p_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  INSERT INTO crew_stock(technician_id, product_id, quantity) VALUES (p_tech, p_product, 0)
    ON CONFLICT DO NOTHING;
  SELECT quantity INTO v FROM crew_stock WHERE technician_id = p_tech AND product_id = p_product FOR UPDATE;
  IF v + p_delta < 0 THEN
    RAISE EXCEPTION 'Onvoldoende toegewezen voorraad (beschikbaar: %)', v USING ERRCODE = 'P0001';
  END IF;
  UPDATE crew_stock SET quantity = v + p_delta, updated_at = now() WHERE technician_id = p_tech AND product_id = p_product;
  INSERT INTO crew_stock_moves(technician_id, product_id, delta, balance_after, kind, work_order_id, material_id, note)
    VALUES (p_tech, p_product, p_delta, v + p_delta, p_kind, p_wo, p_material, p_note);
  RETURN v + p_delta;
END $$;
REVOKE ALL ON FUNCTION public.crew_stock_apply(uuid,uuid,numeric,text,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

-- Admin: assign (+), take back (-) or correct to an exact amount.
CREATE OR REPLACE FUNCTION public.crew_stock_admin(p_tech uuid, p_product uuid, p_mode text, p_quantity numeric, p_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur numeric; d numeric;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Alleen beheerders'; END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN RAISE EXCEPTION 'Aantal moet 0 of meer zijn'; END IF;
  IF p_mode = 'toewijzing' THEN d := p_quantity;
  ELSIF p_mode = 'terugname' THEN d := -p_quantity;
  ELSIF p_mode = 'correctie' THEN
    INSERT INTO crew_stock(technician_id, product_id, quantity) VALUES (p_tech, p_product, 0) ON CONFLICT DO NOTHING;
    SELECT quantity INTO cur FROM crew_stock WHERE technician_id = p_tech AND product_id = p_product FOR UPDATE;
    d := p_quantity - cur;
  ELSE RAISE EXCEPTION 'Onbekende actie'; END IF;
  IF d = 0 THEN RETURN p_quantity; END IF;
  RETURN crew_stock_apply(p_tech, p_product, d, p_mode, NULL, NULL, NULLIF(trim(p_note),''));
END $$;
GRANT EXECUTE ON FUNCTION public.crew_stock_admin(uuid,uuid,text,numeric,text) TO authenticated;

-- Consumption on a work order: each material row deducts exactly once; delete/edit restores the difference.
CREATE OR REPLACE FUNCTION public.materials_crew_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.from_crew_stock THEN
      IF NEW.product_id IS NULL THEN RAISE EXCEPTION 'Product ontbreekt'; END IF;
      SELECT technician_id INTO t FROM work_orders WHERE id = NEW.work_order_id;
      IF t IS NULL THEN RAISE EXCEPTION 'Werkbon heeft geen ploeg'; END IF;
      NEW.stock_technician_id := t;
      PERFORM crew_stock_apply(t, NEW.product_id, -NEW.quantity, 'verbruik', NEW.work_order_id, NEW.id, NULL);
    ELSE
      NEW.stock_technician_id := NULL;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.from_crew_stock IS DISTINCT FROM NEW.from_crew_stock OR OLD.product_id IS DISTINCT FROM NEW.product_id
       OR OLD.stock_technician_id IS DISTINCT FROM NEW.stock_technician_id THEN
      IF OLD.from_crew_stock THEN RAISE EXCEPTION 'Verwijder dit verbruik en voeg het opnieuw toe'; END IF;
      NEW.from_crew_stock := false; NEW.stock_technician_id := NULL;
    END IF;
    IF OLD.from_crew_stock AND NEW.quantity <> OLD.quantity THEN
      PERFORM crew_stock_apply(OLD.stock_technician_id, OLD.product_id, OLD.quantity - NEW.quantity,
        CASE WHEN NEW.quantity > OLD.quantity THEN 'verbruik' ELSE 'verbruik_terug' END, OLD.work_order_id, OLD.id, 'Aantal aangepast');
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.from_crew_stock AND OLD.stock_technician_id IS NOT NULL THEN
      PERFORM crew_stock_apply(OLD.stock_technician_id, OLD.product_id, OLD.quantity, 'verbruik_terug', OLD.work_order_id, OLD.id, 'Verbruik verwijderd');
    END IF;
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER materials_crew_stock_ins BEFORE INSERT ON public.materials FOR EACH ROW EXECUTE FUNCTION public.materials_crew_stock();
CREATE TRIGGER materials_crew_stock_upd BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.materials_crew_stock();
CREATE TRIGGER materials_crew_stock_del BEFORE DELETE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.materials_crew_stock();

CREATE TABLE public.work_order_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  request_key uuid NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'onderweg',
  to_number text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'bezig' CHECK (status IN ('bezig','verzonden','mislukt')),
  provider text NOT NULL DEFAULT 'twilio',
  provider_message_id text,
  error text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_order_sms_wo_idx ON public.work_order_sms(work_order_id, created_at DESC);
GRANT SELECT ON public.work_order_sms TO authenticated;
GRANT ALL ON public.work_order_sms TO service_role;
ALTER TABLE public.work_order_sms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms read" ON public.work_order_sms FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id()));