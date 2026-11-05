DO $m$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.fin_reconcile_bank(uuid,uuid,text,text,numeric)'::regprocedure) INTO d;
  IF position('#variable_conflict' in d) = 0 THEN
    d := regexp_replace(d, 'AS \$function\$\s*', E'AS $function$\n#variable_conflict use_variable\n');
    EXECUTE d;
  END IF;
END $m$;