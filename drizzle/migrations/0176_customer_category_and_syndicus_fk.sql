ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_category text
    CHECK (customer_category IS NULL OR customer_category IN ('zakelijk', 'vme', 'particulier', 'patrimoniumvennootschap')),
  ADD COLUMN IF NOT EXISTS syndicus_id uuid REFERENCES public.syndici(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vme_syndicus_pending boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_category ON public.customers(customer_category);
CREATE INDEX IF NOT EXISTS idx_customers_syndicus_id ON public.customers(syndicus_id);

-- 1:1 koppeling van bestaande klanten met bekende syndicusnaam aan de bestaande syndici-tabel
UPDATE public.customers c
SET syndicus_id = s.id
FROM public.syndici s
WHERE c.syndicus_id IS NULL
  AND COALESCE(NULLIF(trim(c.syndicus_company), ''), NULLIF(trim(c.syndicus), '')) IS NOT NULL
  AND lower(trim(s.company)) = lower(trim(COALESCE(NULLIF(c.syndicus_company, ''), c.syndicus)));

-- Alleen klanten met een bewezen syndicusrelatie krijgen 1:1 de categorie 'vme'; overige blijven NULL (Niet ingedeeld)
UPDATE public.customers
SET customer_category = 'vme'
WHERE customer_category IS NULL
  AND (
    syndicus_id IS NOT NULL
    OR NULLIF(trim(COALESCE(syndicus_company, '')), '') IS NOT NULL
    OR NULLIF(trim(COALESCE(syndicus, '')), '') IS NOT NULL
  );

-- Marketing mag de syndicuslijst lezen voor klantfilters en export
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'syndici' AND policyname = 'Marketing leest syndici'
  ) THEN
    CREATE POLICY "Marketing leest syndici"
      ON public.syndici
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'marketing'::public.app_role));
  END IF;
END $$;