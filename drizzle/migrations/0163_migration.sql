DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('public.fin_book_reconciled_sales_tx(uuid)'::regprocedure),
  'BEGIN
 SELECT * INTO t', 'BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),''admin'') THEN RETURN NULL; END IF;
 SELECT * INTO t');
END $$;