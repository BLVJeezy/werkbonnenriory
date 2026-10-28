CREATE OR REPLACE FUNCTION public.enqueue_simpla_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 RETURN NEW;
END $$;
COMMENT ON FUNCTION public.enqueue_simpla_completion() IS 'DEPRECATED: Simpla sales synchronization retired; completion must not enqueue sales invoices.';
COMMENT ON TABLE public.simpla_sync IS 'DEPRECATED: historical Simpla sales queue retained for audit only; invoices are created exclusively in Riory Werkbonnen.';