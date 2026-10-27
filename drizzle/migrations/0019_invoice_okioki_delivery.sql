ALTER TABLE public.invoices ADD COLUMN pdf_sent_at timestamptz, ADD COLUMN okioki_sent_at timestamptz, ADD COLUMN delivery_lock_until timestamptz;
UPDATE public.invoices SET pdf_sent_at = sent_at WHERE status = 'verzonden' AND sent_via = 'email';
COMMENT ON COLUMN public.invoices.okioki_sent_at IS 'Outlook accepted the UBL email to OkiOki; not a confirmation of Peppol delivery.';