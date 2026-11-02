CREATE TABLE public.quote_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.quote_section_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.quote_sections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_section_items TO authenticated;
GRANT ALL ON public.quote_sections TO service_role;
GRANT ALL ON public.quote_section_items TO service_role;
ALTER TABLE public.quote_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_section_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin beheert titels" ON public.quote_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin beheert titelproducten" ON public.quote_section_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.quote_sections (name, sort_order) VALUES
  ('Opengraven van defecte afvoer', 1),
  ('Herstellen of vervangen van defecte afvoer', 2),
  ('Dichtmaken sleuf en verdichten van de grond', 3),
  ('Afwerken van bovenlaag', 4),
  ('Terugplaatsen klinkers en verharding', 5);