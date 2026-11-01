ALTER TABLE public.products ADD COLUMN photo_paths text[] NOT NULL DEFAULT '{}';
CREATE POLICY "Admin reads product photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-fotos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin uploads product photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-fotos' AND public.has_role(auth.uid(), 'admin'));
