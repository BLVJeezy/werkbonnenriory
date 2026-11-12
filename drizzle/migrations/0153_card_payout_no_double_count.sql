DO $$ DECLARE d text; o text; BEGIN
 SELECT pg_get_functiondef('public.fin_split_bank_payment(uuid,jsonb)'::regprocedure) INTO d; o:=d;
 d := replace(d, 'refs text:=''''; names text:=''''; is_riory boolean;', 'refs text:=''''; names text:=''''; is_riory boolean; card_part numeric:=0; wb_card numeric; is_card boolean;');
 d := replace(d, '   IF part>round(invoice_total-paid,2) THEN RAISE EXCEPTION ''Bedrag overschrijdt saldo van factuur %'',f.number; END IF;
   INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,part,''finance'')',
 '   card_part:=0;
   is_card:=t.amount>0 AND (coalesce(t.counterparty,'''')||'' ''||coalesce(t.description,'''')) ~* ''(ccv|europabank|worldline|bancontact|payconiq|sumup|viva wallet|mollie|bruto:)'';
   IF is_card AND local.id IS NOT NULL THEN
    SELECT coalesce(sum(w.paid_amount),0) INTO wb_card FROM public.work_orders w WHERE (w.id=local.work_order_id OR w.id=ANY(coalesce(local.extra_work_order_ids,''{}''::uuid[]))) AND w.paid_at IS NOT NULL AND w.paid_method ~* ''(bancontact|kaart|card|visa|master|maestro|payconiq)'';
    wb_card:=wb_card-coalesce((SELECT sum(amount) FROM public.fin_bank_allocations WHERE invoice_id=f.id AND mode=''paid''),0);
    card_part:=greatest(0,least(part,round(wb_card,2)));
   END IF;
   IF part-card_part>round(invoice_total-paid,2)+0.005 THEN RAISE EXCEPTION ''Bedrag overschrijdt saldo van factuur %'',f.number; END IF;
   part:=part-card_part;
   IF card_part>0 THEN INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,card_part+part,CASE WHEN part>0 THEN ''finance'' ELSE ''paid'' END) ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount; END IF;
   IF card_part=0 THEN INSERT INTO public.fin_bank_allocations(transaction_id,company_id,user_id,invoice_id,amount,mode) VALUES(t.id,t.company_id,uid,f.id,part,''finance'')');
 d := replace(d, '   UPDATE public.fin_invoices SET paid_amount=paid+part,status=CASE WHEN paid+part>=invoice_total THEN ''betaald''',
 '   END IF;
   UPDATE public.fin_invoices SET paid_amount=paid+part,status=CASE WHEN paid+part>=invoice_total THEN ''betaald''');
 d := replace(d, 'ELSE paid_at END WHERE id=local.id; END IF;
   refs:=', 'ELSE paid_at END WHERE id=local.id; END IF;
   part:=part+card_part;
   refs:=');
 IF d=o OR position('card_part:=greatest' in d)=0 OR position('part:=part+card_part' in d)=0 OR position('   END IF;
   UPDATE public.fin_invoices SET paid_amount=paid+part' in d)=0 THEN RAISE EXCEPTION 'split function layout changed'; END IF;
 EXECUTE d;
END $$;