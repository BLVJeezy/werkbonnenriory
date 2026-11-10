CREATE OR REPLACE FUNCTION public.has_any_app_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.has_any_app_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_any_app_role() TO authenticated;

DROP POLICY IF EXISTS "settings read" ON public.settings;
CREATE POLICY "settings read" ON public.settings FOR SELECT TO authenticated USING (public.has_any_app_role());

DROP POLICY IF EXISTS "activities read" ON public.activities;
CREATE POLICY "activities read" ON public.activities FOR SELECT TO authenticated USING (public.has_any_app_role());

DROP POLICY IF EXISTS "Ingelogden lezen vestigingen" ON public.branches;
CREATE POLICY "Ingelogden lezen vestigingen" ON public.branches FOR SELECT TO authenticated USING (public.has_any_app_role());