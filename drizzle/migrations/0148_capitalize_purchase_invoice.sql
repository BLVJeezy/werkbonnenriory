ALTER TABLE public.fin_investments ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid, ADD COLUMN IF NOT EXISTS purchase_line_index integer;
CREATE UNIQUE INDEX IF NOT EXISTS fin_investments_purchase_line_uniq ON public.fin_investments (purchase_invoice_id, purchase_line_index) WHERE purchase_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fin_capitalize_purchase_line(_purchase uuid, _line_index integer, _asset_account text, _life integer, _start date, _name text, _residual numeric DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_p public.purchase_invoices%ROWTYPE; v_company uuid; v_line jsonb; v_amount numeric; v_asset uuid;
BEGIN
 IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 SELECT * INTO v_p FROM public.purchase_invoices WHERE id = _purchase FOR UPDATE;
 IF NOT FOUND OR v_p.kind = 'creditnota' THEN RAISE EXCEPTION 'Alleen aankoopfacturen kunnen worden afgeschreven'; END IF;
 SELECT id INTO v_company FROM public.companies WHERE user_id = v_uid AND name = 'Riory BV' LIMIT 1;
 IF v_company IS NULL THEN RAISE EXCEPTION 'Bedrijf Riory BV niet gevonden'; END IF;
 v_line := v_p.lines -> _line_index;
 IF v_line IS NULL THEN RAISE EXCEPTION 'Factuurlijn niet gevonden'; END IF;
 v_amount := COALESCE((v_line->>'amount')::numeric, 0);
 IF EXISTS (SELECT 1 FROM public.fin_investments WHERE purchase_invoice_id = _purchase AND purchase_line_index = _line_index) THEN RAISE EXCEPTION 'Deze lijn is al als investering geboekt'; END IF;
 IF _asset_account !~ '^2[0-9]+$' OR NOT EXISTS (SELECT 1 FROM public.fin_accounts WHERE company_id = v_company AND number = _asset_account AND active) THEN RAISE EXCEPTION 'Kies een bestaande actieve rekening van klasse 2'; END IF;
 IF _life IS NULL OR _life <= 0 OR _life > 600 OR _start IS NULL OR length(trim(COALESCE(_name,''))) = 0 OR _residual < 0 OR _residual >= v_amount OR v_amount <= 0 THEN RAISE EXCEPTION 'Controleer levensduur, startdatum, naam, restwaarde en bedrag'; END IF;
 UPDATE public.purchase_invoices SET lines = jsonb_set(lines, ARRAY[_line_index::text, 'account'], to_jsonb(_asset_account)) WHERE id = _purchase;
 INSERT INTO public.fin_investments (user_id, company_id, name, purchase_amount, capitalizable_amount, start_date, useful_life_months, residual_value, purchase_invoice_id, purchase_line_index)
 VALUES (v_uid, v_company, trim(_name), v_amount, v_amount, _start, _life, _residual, _purchase, _line_index) RETURNING id INTO v_asset;
 INSERT INTO public.fin_audit (user_id, company_id, entity, entity_id, action, detail) VALUES (v_uid, v_company, 'aankoopfactuur', _purchase, 'geactiveerd', jsonb_build_object('lijn', _line_index, 'rekening', _asset_account, 'investering', v_asset));
 RETURN v_asset;
END $$;
REVOKE ALL ON FUNCTION public.fin_capitalize_purchase_line(uuid,integer,text,integer,date,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_capitalize_purchase_line(uuid,integer,text,integer,date,text,numeric) TO authenticated;