CREATE POLICY "Admins lezen aankoopfactuur-bestanden" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'aankoopfacturen' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins schrijven aankoopfactuur-bestanden" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'aankoopfacturen' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins verwijderen aankoopfactuur-bestanden" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'aankoopfacturen' AND public.has_role(auth.uid(), 'admin'));