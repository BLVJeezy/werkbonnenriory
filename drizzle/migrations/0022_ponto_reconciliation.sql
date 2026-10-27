ALTER TABLE public.settings ADD COLUMN ponto_client_ciphertext text;
ALTER TABLE public.settings ADD COLUMN ponto_last_sync timestamptz;
ALTER TABLE public.invoices ADD COLUMN paid_at timestamptz;