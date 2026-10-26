ALTER TABLE public.technicians
  ADD COLUMN show_prices boolean NOT NULL DEFAULT true,
  ADD COLUMN show_contact boolean NOT NULL DEFAULT true,
  ADD COLUMN can_payment boolean NOT NULL DEFAULT true,
  ADD COLUMN show_signed boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.my_crew_sees_signed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT show_signed FROM public.technicians WHERE user_id = auth.uid() LIMIT 1), false)
$$;

DROP POLICY "tech read" ON public.work_orders;
CREATE POLICY "tech read" ON public.work_orders FOR SELECT TO authenticated
  USING (technician_id = public.my_technician_id() AND (status <> 'afgetekend' OR public.my_crew_sees_signed()));