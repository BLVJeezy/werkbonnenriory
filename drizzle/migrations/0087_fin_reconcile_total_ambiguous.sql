DO $m$ DECLARE d text; o text:='UPDATE public.invoices SET paid_amount=paid,paid_at=CASE WHEN paid>=total THEN'; BEGIN
 d:=pg_get_functiondef('public.fin_reconcile_bank(uuid,uuid,text,text,numeric)'::regprocedure);
 IF position(o in d)=0 THEN RAISE EXCEPTION 'patch niet toegepast'; END IF;
 d:=replace(d,o,'UPDATE public.invoices SET paid_amount=paid,paid_at=CASE WHEN paid>=local.total THEN');
 EXECUTE d;
END $m$;