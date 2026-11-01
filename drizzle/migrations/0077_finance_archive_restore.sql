CREATE OR REPLACE FUNCTION public.fin_restore_archive(_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t text; rows jsonb; cols text; n integer; counts jsonb := '{}'::jsonb; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Alleen de beheerder kan een boekhouding overnemen'; END IF;
 IF jsonb_typeof(_data) IS DISTINCT FROM 'object' OR pg_column_size(_data)>30000000 THEN RAISE EXCEPTION 'Ongeldige export'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN ('companies','fin_accounts','fin_journal_entries','fin_journal_lines','fin_invoices','fin_invoice_lines','fin_bank_tx','fin_budgets','fin_entries','fin_investments','fin_loans','fin_loan_schedule','fin_months','fin_recurring','fin_rules','fin_sync_status','fin_audit','fin_competitors','fin_competitor_metrics')) THEN RAISE EXCEPTION 'Onbekend onderdeel'; END IF;
 FOREACH t IN ARRAY ARRAY['companies','fin_accounts','fin_rules','fin_invoices','fin_invoice_lines','fin_journal_entries','fin_journal_lines','fin_bank_tx','fin_budgets','fin_entries','fin_investments','fin_loans','fin_loan_schedule','fin_months','fin_recurring','fin_sync_status','fin_audit','fin_competitors','fin_competitor_metrics'] LOOP
  rows := coalesce(_data->t,'[]'::jsonb);
  IF jsonb_typeof(rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Ongeldig onderdeel %',t; END IF;
  IF jsonb_array_length(rows)=0 THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE (r->>'user_id')::uuid IS DISTINCT FROM uid OR r->>'id' IS NULL) THEN RAISE EXCEPTION 'Ongeldige eigenaar in %',t; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I e JOIN jsonb_array_elements($1) r ON e.id=(r->>''id'')::uuid WHERE e.user_id<>$2',t) INTO n USING rows,uid;
  IF n>0 THEN RAISE EXCEPTION 'Bestaande gegevens van een andere eigenaar'; END IF;
  IF t<>'companies' AND EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'company_id' IS NOT NULL AND NOT public.owns_company((r->>'company_id')::uuid)) THEN RAISE EXCEPTION 'Bedrijf niet toegankelijk'; END IF;
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) INTO cols FROM pg_attribute a WHERE a.attrelid=format('public.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF t='companies' THEN
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1) ON CONFLICT(id) DO UPDATE SET enterprise_number=EXCLUDED.enterprise_number',t,cols,cols,t) USING rows;
  ELSIF t='fin_accounts' THEN
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1) ON CONFLICT(company_id,number) DO UPDATE SET name=EXCLUDED.name,source=EXCLUDED.source,active=EXCLUDED.active',t,cols,cols,t) USING rows;
  ELSIF t='fin_bank_tx' THEN
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1) ON CONFLICT(id) DO UPDATE SET matched_invoice_id=EXCLUDED.matched_invoice_id,entry_id=EXCLUDED.entry_id WHERE public.fin_bank_tx.company_id=EXCLUDED.company_id AND public.fin_bank_tx.tx_date=EXCLUDED.tx_date AND public.fin_bank_tx.amount=EXCLUDED.amount AND public.fin_bank_tx.entry_id IS NULL AND public.fin_bank_tx.matched_invoice_id IS NULL',t,cols,cols,t) USING rows;
  ELSE
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1) ON CONFLICT(id) DO NOTHING',t,cols,cols,t) USING rows;
  END IF;
  GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object(t,n);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.fin_journal_lines l JOIN jsonb_array_elements(coalesce(_data->'fin_journal_entries','[]')) r ON l.entry_id=(r->>'id')::uuid GROUP BY l.entry_id HAVING round(sum(l.debit-l.credit),2)<>0) THEN RAISE EXCEPTION 'Boeking niet in evenwicht'; END IF;
 IF EXISTS(SELECT 1 FROM public.fin_journal_lines l JOIN jsonb_array_elements(coalesce(_data->'fin_journal_lines','[]')) r ON l.id=(r->>'id')::uuid JOIN public.fin_journal_entries e ON e.id=l.entry_id WHERE l.company_id<>e.company_id OR l.user_id<>e.user_id) THEN RAISE EXCEPTION 'Boekingslijn hoort niet bij dit bedrijf'; END IF;
 IF EXISTS(SELECT 1 FROM public.fin_invoice_lines l JOIN jsonb_array_elements(coalesce(_data->'fin_invoice_lines','[]')) r ON l.id=(r->>'id')::uuid JOIN public.fin_invoices i ON i.id=l.invoice_id WHERE l.user_id<>i.user_id OR (l.company_id IS NOT NULL AND l.company_id<>i.company_id)) THEN RAISE EXCEPTION 'Factuurlijn hoort niet bij dit bedrijf'; END IF;
 IF EXISTS(SELECT 1 FROM public.fin_competitor_metrics m JOIN jsonb_array_elements(coalesce(_data->'fin_competitor_metrics','[]')) r ON m.id=(r->>'id')::uuid JOIN public.fin_competitors c ON c.id=m.competitor_id WHERE m.user_id<>c.user_id) THEN RAISE EXCEPTION 'Concurrent hoort niet bij deze eigenaar'; END IF;
 INSERT INTO public.fin_audit(user_id,entity,action,detail) VALUES(uid,'boekhouding','volledige_export_overgenomen',counts);
 RETURN counts;
END $$;
REVOKE ALL ON FUNCTION public.fin_restore_archive(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_restore_archive(jsonb) TO authenticated;
COMMENT ON FUNCTION public.fin_restore_archive(jsonb) IS 'Admin-only atomic typed archive restore; requires owned companies, preserves IDs and posted journal balance, no access to operational tables.';