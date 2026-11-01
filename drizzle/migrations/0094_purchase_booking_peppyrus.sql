ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bic text;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS peppyrus_message_id text, ADD COLUMN IF NOT EXISTS booked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_peppyrus_unique ON public.purchase_invoices(peppyrus_message_id) WHERE peppyrus_message_id IS NOT NULL;
CREATE TABLE public.purchase_booking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  match_key text NOT NULL,
  account text NOT NULL,
  uses integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX purchase_booking_rules_key ON public.purchase_booking_rules(coalesce(supplier_id,'00000000-0000-0000-0000-000000000000'::uuid), match_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_booking_rules TO authenticated;
GRANT ALL ON public.purchase_booking_rules TO service_role;
ALTER TABLE public.purchase_booking_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins beheren boekingsregels" ON public.purchase_booking_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));