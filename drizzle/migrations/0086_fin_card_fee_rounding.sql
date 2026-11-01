DO $m$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.fin_reconcile_bank(uuid,uuid,text,text,numeric)'::regprocedure);
 d:=replace(d,E'  IF amount>balance THEN RAISE EXCEPTION ''Het bedrag is hoger dan het openstaande saldo''; END IF;',
  E'  IF fee>0 AND amount>balance AND amount-balance<=0.05 AND balance>abs(t.amount) THEN fee:=round(balance-abs(t.amount),2); amount:=balance; lines:=jsonb_set(jsonb_set(lines,''{1,credit}'',to_jsonb(greatest(t.amount,0)+fee)),''{2,debit}'',to_jsonb(fee)); END IF;\n  IF amount>balance THEN RAISE EXCEPTION ''Het bedrag is hoger dan het openstaande saldo''; END IF;');
 IF position('amount-balance<=0.05' in d)=0 THEN RAISE EXCEPTION 'patch niet toegepast'; END IF;
 EXECUTE d;
END $m$;