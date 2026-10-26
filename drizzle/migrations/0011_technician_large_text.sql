ALTER TABLE public.technicians ADD COLUMN large_text boolean NOT NULL DEFAULT false;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technicians TO authenticated;
GRANT ALL ON public.technicians TO service_role;