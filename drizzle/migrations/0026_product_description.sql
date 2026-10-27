ALTER TABLE public.products ADD COLUMN description text NOT NULL DEFAULT '';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;