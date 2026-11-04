ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS supplier_bic text;

UPDATE public.purchase_invoices p
   SET supplier_bic = upper(replace(trim(s.bic), ' ', ''))
  FROM public.suppliers s
 WHERE p.supplier_id = s.id
   AND p.supplier_bic IS NULL
   AND nullif(trim(s.bic), '') IS NOT NULL;