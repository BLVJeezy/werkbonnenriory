ALTER TABLE public.work_orders ADD COLUMN insurance_report_text text, ADD COLUMN insurance_report_saved_at timestamptz;
ALTER TABLE public.settings ADD COLUMN insurance_report_ai_denial jsonb;
COMMENT ON COLUMN public.work_orders.insurance_report_text IS 'Admin-reviewed, price-free insurance report findings, separate from technician work_notes.';