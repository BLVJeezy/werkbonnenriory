CREATE TABLE public.customer_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_videos TO authenticated;
GRANT ALL ON public.customer_videos TO service_role;
ALTER TABLE public.customer_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin videos" ON public.customer_videos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin reads videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'klant-filmpjes' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin uploads videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'klant-filmpjes' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin deletes videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'klant-filmpjes' AND public.has_role(auth.uid(), 'admin'));