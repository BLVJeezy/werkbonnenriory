-- ============================================================================
-- INERT DRAFT FOLLOW-UP MIGRATION — NOT APPLIED (FOR SEPARATE REVIEW)
-- ============================================================================
-- Hardens 0180_create_customer_communications_audio.sql so that:
--   1. Direct client storage.objects policies for `customer-communications-audio`
--      are removed (all upload/playback/delete flows are server-mediated).
--   2. Audit rows survive deletion of a `customer_communications` record
--      (communication_id nullable with ON DELETE SET NULL).
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read private communication audio" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload private communication audio" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete private communication audio" ON storage.objects;

ALTER TABLE public.customer_communication_audit
  ALTER COLUMN communication_id DROP NOT NULL;

ALTER TABLE public.customer_communication_audit
  DROP CONSTRAINT IF EXISTS customer_communication_audit_communication_id_fkey;

ALTER TABLE public.customer_communication_audit
  ADD CONSTRAINT customer_communication_audit_communication_id_fkey
  FOREIGN KEY (communication_id)
  REFERENCES public.customer_communications(id)
  ON DELETE SET NULL;