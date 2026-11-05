ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS dokapi_document_id text;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_dokapi_unique ON public.purchase_invoices(dokapi_document_id) WHERE dokapi_document_id IS NOT NULL;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS peppol_webhook_secret text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS peppol_sent_at timestamptz;
COMMENT ON COLUMN public.purchase_invoices.dokapi_document_id IS 'Dokapi ULID van het ontvangen Peppol-document (dedupe).';
COMMENT ON COLUMN public.settings.peppol_webhook_secret IS 'HMAC-geheim waarmee Dokapi-webhooks geverifieerd worden.';
COMMENT ON COLUMN public.invoices.peppol_sent_at IS 'Wanneer de UBL via Dokapi/Peppol verzonden is; leeg = enkel per mail.';