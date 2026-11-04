ALTER TABLE public.fin_invoice_lines ADD COLUMN IF NOT EXISTS vat_rate smallint;
UPDATE public.fin_invoice_lines SET vat_rate = CASE
  WHEN ex_vat = 0 THEN NULL
  WHEN abs(vat) <= 0.02 THEN 0
  WHEN abs(abs(vat) - abs(ex_vat) * 0.06) <= greatest(0.05, abs(ex_vat) * 0.002) THEN 6
  WHEN abs(abs(vat) - abs(ex_vat) * 0.21) <= greatest(0.05, abs(ex_vat) * 0.002) THEN 21
  ELSE NULL END
WHERE vat_rate IS NULL;
ALTER TABLE public.fin_invoice_lines ADD CONSTRAINT fin_invoice_lines_vat_rate_chk CHECK (vat_rate IS NULL OR vat_rate IN (0, 6, 21));
COMMENT ON COLUMN public.fin_invoice_lines.vat_rate IS 'Btw-tarief per lijn: 0/6/21; NULL = gemengd of fout uitgelezen, te controleren';