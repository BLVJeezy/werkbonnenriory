-- ============================================================================
-- INERT DRAFT MIGRATION — DO NOT AUTO-APPLY
-- ============================================================================
-- Stored under docs/migrations/ (NOT drizzle/migrations/) so Drizzle Kit does
-- NOT auto-apply this file to production or shared Cloud databases.
--
-- Purpose:
--   1. Track verified customer WhatsApp opt-in / consent provenance
--      (`public.customer_whatsapp_consents`).
--   2. Provide atomic, durable duplicate protection and send audit for the
--      fixed utility template "We zijn onderweg" (`public.work_order_whatsapp_sends`).
--
-- Draft Meta utility template (static, no PII parameters):
--   "Dag, de technieker van Riory is onderweg voor uw afspraak."
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_whatsapp_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted', 'withdrawn')),
  source TEXT NOT NULL,
  recorded_by UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, phone_e164)
);

CREATE TABLE IF NOT EXISTS public.work_order_whatsapp_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL DEFAULT 'we_zijn_onderweg',
  recipient_masked TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prepared', 'accepted', 'uncertain', 'failed')),
  provider_message_id TEXT,
  error_code TEXT,
  sent_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_work_order_whatsapp_once UNIQUE (work_order_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_work_order_whatsapp_sends_wo
  ON public.work_order_whatsapp_sends(work_order_id);

GRANT SELECT, INSERT, UPDATE ON public.customer_whatsapp_consents TO authenticated;
GRANT ALL ON public.customer_whatsapp_consents TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.work_order_whatsapp_sends TO authenticated;
GRANT ALL ON public.work_order_whatsapp_sends TO service_role;

ALTER TABLE public.customer_whatsapp_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_whatsapp_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage WhatsApp consents"
  ON public.customer_whatsapp_consents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins and assigned technicians can view WhatsApp sends"
  ON public.work_order_whatsapp_sends
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_whatsapp_sends.work_order_id
        AND wo.technician_id = public.my_technician_id()
    )
  );

CREATE POLICY "Admins and assigned technicians can insert WhatsApp sends"
  ON public.work_order_whatsapp_sends
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_whatsapp_sends.work_order_id
        AND wo.technician_id = public.my_technician_id()
    )
  );

CREATE POLICY "Admins and assigned technicians can update WhatsApp sends"
  ON public.work_order_whatsapp_sends
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_whatsapp_sends.work_order_id
        AND wo.technician_id = public.my_technician_id()
    )
  );