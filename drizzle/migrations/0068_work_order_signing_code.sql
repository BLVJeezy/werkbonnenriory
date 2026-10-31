ALTER TABLE public.work_orders ADD COLUMN signing_code TEXT;
CREATE UNIQUE INDEX work_orders_signing_code_key ON public.work_orders (signing_code) WHERE signing_code IS NOT NULL;
COMMENT ON COLUMN public.work_orders.signing_code IS 'Korte code die bij de werkbonmail wordt meegestuurd zodat de klant de werkbon digitaal kan ondertekenen.';