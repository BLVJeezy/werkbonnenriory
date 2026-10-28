CREATE TABLE public.invoice_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
 stage integer NOT NULL CHECK (stage BETWEEN 1 AND 3),
 status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','accepted','uncertain','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 created_by uuid NOT NULL,
 recipient text NOT NULL,
 document jsonb NOT NULL,
 error text,
 UNIQUE(invoice_id, stage)
);
GRANT SELECT ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;
ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read reminder history" ON public.invoice_reminders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
COMMENT ON TABLE public.invoice_reminders IS 'Immutable one-time reminder claims: ambiguous mail acceptance requires manual Outlook review; never auto-retry. Content and recipient snapshots preserve the exact demand.';