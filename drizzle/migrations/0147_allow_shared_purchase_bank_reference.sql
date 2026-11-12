-- One bank payment can settle multiple purchase invoices. The atomic ledger
-- and per-transaction/per-invoice allocation uniqueness remain authoritative.
DROP INDEX IF EXISTS public.purchase_bank_transaction_unique;
CREATE INDEX IF NOT EXISTS purchase_bank_transaction_lookup ON public.purchase_invoices(bank_transaction_key) WHERE bank_transaction_key IS NOT NULL;
COMMENT ON INDEX public.purchase_bank_transaction_lookup IS 'Non-unique display reference; payment claims are protected by ponto_reconciliations and fin_bank_allocations.';