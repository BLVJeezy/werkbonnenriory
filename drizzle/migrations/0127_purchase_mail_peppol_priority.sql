ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS original_ubl_path text;
CREATE TABLE public.purchase_mail_imports (attachment_key text PRIMARY KEY, purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.purchase_mail_imports TO service_role;
ALTER TABLE public.purchase_mail_imports ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.ingest_purchase_document(p_document jsonb, p_attachment_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.purchase_invoices; r public.purchase_invoices; n text; s text; v text; result_action text; finance_exists boolean;
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' AND NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF p_document->>'source' NOT IN ('mail','peppol') THEN RAISE EXCEPTION 'Ongeldige documentbron'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('purchase_document_ingestion',0));
 IF p_attachment_key IS NOT NULL AND EXISTS(SELECT 1 FROM public.purchase_mail_imports WHERE attachment_key=p_attachment_key) THEN RETURN jsonb_build_object('action','skipped'); END IF;
 n:=regexp_replace(lower(coalesce(p_document->>'invoice_number','')),'[^a-z0-9]','','g');
 s:=regexp_replace(lower(coalesce(p_document->>'supplier_name','')),'[^a-z0-9]','','g');
 v:=regexp_replace(lower(coalesce(p_document->>'supplier_vat','')),'[^a-z0-9]','','g');
 SELECT * INTO p FROM public.purchase_invoices x WHERE
 (p_document->>'peppyrus_message_id' IS NOT NULL AND x.peppyrus_message_id=p_document->>'peppyrus_message_id') OR
 (p_document->>'upload_hash' IS NOT NULL AND x.upload_hash=p_document->>'upload_hash') OR
 ((s<>'' OR v<>'') AND ((v<>'' AND regexp_replace(lower(coalesce(x.supplier_vat,'')),'[^a-z0-9]','','g')=v) OR (s<>'' AND regexp_replace(lower(x.supplier_name),'[^a-z0-9]','','g')=s AND (v='' OR coalesce(x.supplier_vat,'')='' OR regexp_replace(lower(x.supplier_vat),'[^a-z0-9]','','g')=v))) AND x.kind=coalesce(p_document->>'kind','factuur') AND
 ((n<>'' AND regexp_replace(lower(coalesce(x.invoice_number,'')),'[^a-z0-9]','','g')=n) OR (n='' AND coalesce(x.invoice_number,'')='' AND x.invoice_date=(p_document->>'invoice_date')::date AND x.total=(p_document->>'total')::numeric)))
 ORDER BY (x.source='peppol') DESC,x.created_at LIMIT 1 FOR UPDATE;
 IF p.id IS NOT NULL THEN
  result_action:='skipped'; r:=p;
  IF p_document->>'source'='peppol' AND p.peppyrus_message_id IS NULL THEN
   UPDATE public.purchase_invoices SET source='peppol',peppyrus_message_id=p_document->>'peppyrus_message_id',original_ubl_path=p_document->>'original_ubl_path',pdf_path=coalesce(p_document->>'pdf_path',pdf_path),
    supplier_vat=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN p_document->>'supplier_vat' ELSE supplier_vat END,
    supplier_iban=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN p_document->>'supplier_iban' ELSE supplier_iban END,
    supplier_bic=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN p_document->>'supplier_bic' ELSE supplier_bic END,
    lines=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN p_document->'lines' ELSE lines END,
    net=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN (p_document->>'net')::numeric ELSE net END,
    vat=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN (p_document->>'vat')::numeric ELSE vat END,
    total=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN (p_document->>'total')::numeric ELSE total END,
    due_date=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN (p_document->>'due_date')::date ELSE due_date END,
    payment_ref=CASE WHEN status='te_controleren' AND booked_at IS NULL THEN p_document->>'payment_ref' ELSE payment_ref END
   WHERE id=p.id RETURNING * INTO r; result_action:='upgraded';
  END IF;
 ELSE
  IF p_document->>'source'='mail' AND n<>'' AND s<>'' THEN
   SELECT EXISTS(SELECT 1 FROM public.fin_invoices f JOIN public.companies c ON c.id=f.company_id WHERE f.direction='aankoop' AND lower(trim(c.name))='riory bv' AND (auth.role()='service_role' OR f.user_id=auth.uid()) AND regexp_replace(lower(coalesce(f.number,'')),'[^a-z0-9]','','g')=n AND regexp_replace(lower(coalesce(f.counterparty,'')),'[^a-z0-9]','','g')=s) INTO finance_exists;
  END IF;
  IF coalesce(finance_exists,false) THEN result_action:='skipped';
  ELSE
   INSERT INTO public.purchase_invoices(supplier_name,supplier_vat,supplier_iban,supplier_bic,invoice_number,invoice_date,due_date,lines,net,vat,total,payment_ref,source,status,pdf_path,email_message_id,upload_hash,peppyrus_message_id,kind,original_ubl_path)
   VALUES(coalesce(p_document->>'supplier_name','Onbekend'),p_document->>'supplier_vat',p_document->>'supplier_iban',p_document->>'supplier_bic',p_document->>'invoice_number',(p_document->>'invoice_date')::date,(p_document->>'due_date')::date,coalesce(p_document->'lines','[]'),coalesce((p_document->>'net')::numeric,0),coalesce((p_document->>'vat')::numeric,0),coalesce((p_document->>'total')::numeric,0),p_document->>'payment_ref',p_document->>'source','te_controleren',p_document->>'pdf_path',p_document->>'email_message_id',p_document->>'upload_hash',p_document->>'peppyrus_message_id',coalesce(p_document->>'kind','factuur'),p_document->>'original_ubl_path') RETURNING * INTO r; result_action:='imported';
  END IF;
 END IF;
 IF p_attachment_key IS NOT NULL THEN INSERT INTO public.purchase_mail_imports(attachment_key,purchase_invoice_id) VALUES(p_attachment_key,r.id); END IF;
 RETURN jsonb_build_object('action',result_action,'id',r.id,'supplier_id',r.supplier_id);
END $$;
REVOKE ALL ON FUNCTION public.ingest_purchase_document(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ingest_purchase_document(jsonb,text) TO authenticated,service_role;