CREATE OR REPLACE FUNCTION public.fin_capitalize_invoice_line(_line uuid, _asset_account text, _life integer, _start date, _name text, _residual numeric DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_line public.fin_invoice_lines%ROWTYPE; v_inv public.fin_invoices%ROWTYPE; v_post uuid; v_asset uuid; v_old text; v_correction uuid;
BEGIN
 IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO v_line FROM public.fin_invoice_lines WHERE id = _line AND user_id = v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Factuurlijn niet gevonden'; END IF;
 SELECT * INTO v_inv FROM public.fin_invoices WHERE id = v_line.invoice_id AND user_id = v_uid AND public.owns_company(company_id);
 IF NOT FOUND OR v_inv.direction <> 'aankoop' OR v_inv.doc_type <> 'factuur' THEN RAISE EXCEPTION 'Alleen eigen aankoopfacturen kunnen worden geactiveerd'; END IF;
 IF v_line.is_investment OR EXISTS (SELECT 1 FROM public.fin_investments WHERE invoice_line_id = _line) THEN RAISE EXCEPTION 'Deze factuurlijn is al als investering gemarkeerd'; END IF;
 IF _asset_account !~ '^2[0-9]+$' OR NOT EXISTS (SELECT 1 FROM public.fin_accounts WHERE company_id = v_inv.company_id AND number = _asset_account AND active) THEN RAISE EXCEPTION 'Kies een bestaande actieve rekening van klasse 2'; END IF;
 IF _life IS NULL OR _life <= 0 OR _life > 600 OR _start IS NULL OR _name IS NULL OR length(trim(_name)) = 0 OR _residual < 0 OR _residual >= v_line.ex_vat OR v_line.ex_vat <= 0 THEN RAISE EXCEPTION 'Controleer levensduur, startdatum, naam, restwaarde en bedrag'; END IF;
 SELECT id INTO v_post FROM public.fin_journal_entries WHERE company_id = v_inv.company_id AND ((source = 'simpla' AND source_ref = v_inv.source_ref) OR (source = 'factuur' AND source_ref = v_inv.id::text)) ORDER BY created_at LIMIT 1;
 v_old := v_line.account;
 IF v_post IS NOT NULL THEN
 IF v_old IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_journal_lines WHERE entry_id = v_post AND account = v_old AND debit >= v_line.ex_vat) THEN RAISE EXCEPTION 'Bestaande boeking wijkt af; laat de rekening eerst door de boekhouder controleren'; END IF;
 IF v_old <> _asset_account THEN v_correction := public.fin_post_entry(v_inv.company_id, 'divers', COALESCE(v_inv.invoice_date, CURRENT_DATE), 'Activering ' || trim(_name), v_inv.number, 'investeringscorrectie', _line::text, jsonb_build_array(jsonb_build_object('account', _asset_account, 'debit', v_line.ex_vat, 'credit', 0), jsonb_build_object('account', v_old, 'debit', 0, 'credit', v_line.ex_vat))); END IF;
 END IF;
 UPDATE public.fin_invoice_lines SET account = _asset_account, category = 'investering', is_investment = true, suggestion_rule_id = NULL, confidence = NULL WHERE id = _line;
 INSERT INTO public.fin_investments (user_id, company_id, name, purchase_amount, capitalizable_amount, start_date, useful_life_months, residual_value, invoice_line_id) VALUES (v_uid, v_inv.company_id, trim(_name), v_line.ex_vat, v_line.ex_vat, _start, _life, _residual, _line) RETURNING id INTO v_asset;
 INSERT INTO public.fin_audit (user_id, company_id, entity, entity_id, action, detail) VALUES (v_uid, v_inv.company_id, 'factuurlijn', _line, 'geactiveerd', jsonb_build_object('oude_rekening', v_old, 'nieuwe_rekening', _asset_account, 'investering', v_asset, 'correctie', v_correction));
 RETURN v_asset;
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_capitalize_invoice_line(uuid,text,integer,date,text,numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_capitalize_invoice_line(uuid,text,integer,date,text,numeric) TO authenticated;