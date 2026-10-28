ALTER TABLE public.work_orders ADD COLUMN urgent boolean NOT NULL DEFAULT false;

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  number text,
  name text NOT NULL,
  description text,
  technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  repeat_every integer NOT NULL DEFAULT 1 CHECK (repeat_every > 0),
  repeat_unit text NOT NULL DEFAULT 'maand' CHECK (repeat_unit IN ('week','maand','jaar')),
  next_date date NOT NULL,
  end_date date,
  invoice_amount numeric,
  invoice_every integer NOT NULL DEFAULT 1 CHECK (invoice_every > 0),
  invoice_unit text NOT NULL DEFAULT 'maand' CHECK (invoice_unit IN ('week','maand','jaar')),
  next_invoice_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contracts" ON public.contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.work_orders ADD COLUMN contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX work_orders_contract_date ON public.work_orders(contract_id, scheduled_date) WHERE contract_id IS NOT NULL;

-- Contract work orders are informational only: never queue them for Simpla invoicing.
CREATE OR REPLACE FUNCTION public.enqueue_simpla_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.status = 'afgetekend' AND OLD.status IS DISTINCT FROM 'afgetekend' AND NEW.contract_id IS NULL THEN
 INSERT INTO public.simpla_sync(work_order_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;