CREATE OR REPLACE FUNCTION public.fin_active_control_account(_company uuid, _direction text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE prefix_value text; standard_value text; account_value text;
BEGIN
 IF _direction NOT IN ('aankoop','verkoop') OR _direction IS NULL THEN RAISE EXCEPTION 'Ongeldige factuurrichting'; END IF;
 prefix_value:=CASE WHEN _direction='aankoop' THEN '440' ELSE '400' END;
 standard_value:=prefix_value||'000';
 SELECT number INTO account_value FROM public.fin_accounts
 WHERE company_id=_company AND active AND number LIKE prefix_value||'%'
 ORDER BY (number=standard_value) DESC,number LIMIT 1;
 IF account_value IS NULL THEN RAISE EXCEPTION 'Actieve centralisatierekening (%) ontbreekt',prefix_value; END IF;
 RETURN account_value;
END $$;
REVOKE ALL ON FUNCTION public.fin_active_control_account(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_active_control_account(uuid,text) TO authenticated,service_role;
DO $$
DECLARE def text; old_value text; new_value text;
BEGIN
 SELECT pg_get_functiondef('public.fin_split_bank_payment(uuid,jsonb)'::regprocedure) INTO def;
 old_value:='counter_value:=CASE WHEN t.amount<0 THEN ''440000'' ELSE ''400000'' END;';
 new_value:='counter_value:=public.fin_active_control_account(t.company_id,direction_value);';
 IF strpos(def,old_value)=0 THEN RAISE EXCEPTION 'Onverwachte definitie fin_split_bank_payment'; END IF;
 EXECUTE replace(def,old_value,new_value);
 SELECT pg_get_functiondef('public.fin_link_manual_bank(uuid,uuid,text)'::regprocedure) INTO def;
 old_value:='counter_account_value:=CASE WHEN f.direction=''verkoop'' THEN ''400000'' ELSE ''440000'' END;';
 new_value:='counter_account_value:=public.fin_active_control_account(t.company_id,f.direction);';
 IF strpos(def,old_value)=0 THEN RAISE EXCEPTION 'Onverwachte definitie fin_link_manual_bank'; END IF;
 EXECUTE replace(def,old_value,new_value);
 SELECT pg_get_functiondef('public.fin_link_purchase_bank(uuid,uuid,text)'::regprocedure) INTO def;
 old_value:='entry uuid; lines jsonb;';
 IF strpos(def,old_value)=0 OR strpos(def,'number=''440000'' AND active')=0 OR strpos(def,'''account'',''440000''')=0 THEN RAISE EXCEPTION 'Onverwachte definitie fin_link_purchase_bank'; END IF;
 def:=replace(def,old_value,'entry uuid; lines jsonb; counter_value text;');
 def:=replace(def,'IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=t.bank_account AND active)', 'counter_value:=public.fin_active_control_account(t.company_id,''aankoop''); IF NOT EXISTS(SELECT 1 FROM public.fin_accounts WHERE company_id=t.company_id AND number=t.bank_account AND active)');
 def:=replace(def,'number=''440000'' AND active','number=counter_value AND active');
 def:=replace(def,'''account'',''440000''','''account'',counter_value');
 def:=replace(def,'Actieve bankrekening of rekening 440000 ontbreekt','Actieve bankrekening of tegenrekening ontbreekt');
 EXECUTE def;
END $$;