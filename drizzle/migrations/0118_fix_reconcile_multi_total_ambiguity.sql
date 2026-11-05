DO $m$
DECLARE d text; old text := 'paid_at=CASE WHEN round(paid_amount+bal,2)>=total-0.005 THEN t.tx_date::timestamp';
BEGIN
  SELECT pg_get_functiondef('public.fin_reconcile_bank_multi(uuid,uuid[],text,text,numeric)'::regprocedure) INTO d;
  IF position(old in d) = 0 THEN RAISE EXCEPTION 'expected text not found'; END IF;
  d := replace(d, old, 'paid_at=CASE WHEN round(paid_amount+bal,2)>=local.total-0.005 THEN t.tx_date::timestamp');
  IF position('#variable_conflict' in d) = 0 THEN
    d := regexp_replace(d, 'AS \$function\$\s*', E'AS $function$\n#variable_conflict use_variable\n');
  END IF;
  EXECUTE d;
END $m$;