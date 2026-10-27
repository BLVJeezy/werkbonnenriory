ALTER TABLE public.invoices DROP CONSTRAINT invoices_work_order_id_key;
CREATE INDEX invoices_work_order_id_idx ON public.invoices (work_order_id);