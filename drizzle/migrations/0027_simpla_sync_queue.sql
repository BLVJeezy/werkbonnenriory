CREATE TABLE public.simpla_sync (
 work_order_id uuid PRIMARY KEY REFERENCES public.work_orders(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','sent','uncertain')),
 remote_id text,
 error text,
 attempted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.simpla_sync TO authenticated;
GRANT ALL ON public.simpla_sync TO service_role;
ALTER TABLE public.simpla_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads simpla" ON public.simpla_sync FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.enqueue_simpla_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.status = 'afgetekend' AND OLD.status IS DISTINCT FROM 'afgetekend' THEN
 INSERT INTO public.simpla_sync(work_order_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enqueue_simpla_completion AFTER UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_simpla_completion();