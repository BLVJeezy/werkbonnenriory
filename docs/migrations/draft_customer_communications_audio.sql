-- ============================================================================
-- INERT DRAFT MIGRATION — DO NOT AUTO-APPLY
-- ============================================================================
-- Stored under docs/migrations/ (NOT drizzle/migrations/) so Drizzle Kit does
-- NOT auto-apply this file to production or shared Cloud databases.
--
-- Before applying:
--   1. Complete security & privacy review.
--   2. Approve a formal audio retention policy (no automatic deletion is set).
--   3. Create the private storage bucket `customer-communications-audio` via
--      the Storage API (public = false, file_size_limit = '25MB',
--      allowed_mime_types = audio/mpeg, audio/mp4, audio/x-m4a, audio/wav,
--      audio/x-wav, audio/ogg, audio/webm).
--   4. Apply this DDL via the approved migration workflow and enable the
--      server-side feature flags only after verification.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.customer_projects(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  counterpart_phone_raw TEXT,
  counterpart_phone_e164 TEXT,
  match_status TEXT NOT NULL DEFAULT 'manual'
    CHECK (match_status IN ('matched', 'ambiguous', 'unmatched', 'manual')),
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (
    mime_type IN (
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/webm'
    )
  ),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  recorded_at TIMESTAMPTZ,
  lawful_basis_confirmed BOOLEAN NOT NULL DEFAULT FALSE CHECK (lawful_basis_confirmed = TRUE),
  notes TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_communications_customer_id
  ON public.customer_communications(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_communications_phone_e164
  ON public.customer_communications(counterpart_phone_e164)
  WHERE counterpart_phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.customer_communication_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES public.customer_communications(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('upload', 'playback', 'download', 'ownership_change', 'delete')),
  actor_user_id UUID NOT NULL,
  previous_customer_id UUID,
  new_customer_id UUID,
  previous_work_order_id UUID,
  new_work_order_id UUID,
  previous_project_id UUID,
  new_project_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_communication_audit_comm_id
  ON public.customer_communication_audit(communication_id, created_at DESC);

-- Enforce that optional work_order_id and project_id belong to customer_id
CREATE OR REPLACE FUNCTION public.validate_customer_communication_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wo_customer_id UUID;
  proj_customer_id UUID;
BEGIN
  IF NEW.work_order_id IS NOT NULL THEN
    SELECT customer_id INTO wo_customer_id
    FROM public.work_orders
    WHERE id = NEW.work_order_id;

    IF wo_customer_id IS NULL OR wo_customer_id <> NEW.customer_id THEN
      RAISE EXCEPTION 'Work order does not belong to the selected customer';
    END IF;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT customer_id INTO proj_customer_id
    FROM public.customer_projects
    WHERE id = NEW.project_id;

    IF proj_customer_id IS NULL OR proj_customer_id <> NEW.customer_id THEN
      RAISE EXCEPTION 'Project does not belong to the selected customer';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_customer_communication_ownership
  ON public.customer_communications;
CREATE TRIGGER trg_validate_customer_communication_ownership
  BEFORE INSERT OR UPDATE ON public.customer_communications
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_customer_communication_ownership();

-- Grants: authenticated + service_role only (NO anon access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_communications TO authenticated;
GRANT ALL ON public.customer_communications TO service_role;

GRANT SELECT, INSERT ON public.customer_communication_audit TO authenticated;
GRANT ALL ON public.customer_communication_audit TO service_role;

-- RLS: default deny to all roles except Riory admin (blocks customer, technician, marketing, anon)
ALTER TABLE public.customer_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_communication_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage customer communications"
  ON public.customer_communications
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view customer communication audit"
  ON public.customer_communication_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert customer communication audit"
  ON public.customer_communication_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Private storage policies for bucket `customer-communications-audio`
-- (Create the bucket via Storage API with public = false before applying.)
CREATE POLICY "Admins can read private communication audio"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'customer-communications-audio'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can upload private communication audio"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'customer-communications-audio'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete private communication audio"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'customer-communications-audio'
    AND public.has_role(auth.uid(), 'admin')
  );