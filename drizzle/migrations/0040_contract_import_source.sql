ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS source_data jsonb;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS scheduling_ready boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.contracts.source_data IS 'Original imported contract rows, preserving contract date, term, prices, discounts and VAT. Admin-only through existing contract RLS.';
COMMENT ON COLUMN public.contracts.scheduling_ready IS 'False for imported contracts until the first future visit and recurrence are confirmed; excludes them from automatic planning.';