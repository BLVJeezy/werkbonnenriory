ALTER TABLE public.invoices ADD COLUMN accountant_sent_at timestamptz;
COMMENT ON COLUMN public.invoices.accountant_sent_at IS 'Wanneer dit document meegestuurd werd in het pakket naar de boekhouder.';
ALTER TABLE public.purchase_invoices ADD COLUMN accountant_sent_at timestamptz;
COMMENT ON COLUMN public.purchase_invoices.accountant_sent_at IS 'Wanneer dit document meegestuurd werd in het pakket naar de boekhouder.';