CREATE TABLE public.work_order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_photos TO authenticated;
GRANT ALL ON public.work_order_photos TO service_role;
ALTER TABLE public.work_order_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.work_order_photos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tech read" ON public.work_order_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id()));
CREATE POLICY "tech own" ON public.work_order_photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_id AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'));

CREATE POLICY "werkbon fotos admin" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'werkbon-fotos' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'werkbon-fotos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "werkbon fotos tech read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'werkbon-fotos' AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id::text = (storage.foldername(name))[1] AND w.technician_id = public.my_technician_id()));
CREATE POLICY "werkbon fotos tech write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'werkbon-fotos' AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id::text = (storage.foldername(name))[1] AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'));
CREATE POLICY "werkbon fotos tech delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'werkbon-fotos' AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id::text = (storage.foldername(name))[1] AND w.technician_id = public.my_technician_id() AND w.status <> 'afgetekend'));