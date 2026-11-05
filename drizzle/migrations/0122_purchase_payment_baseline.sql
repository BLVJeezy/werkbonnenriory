ALTER TABLE public.purchase_invoices ADD COLUMN bank_paid_base numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.purchase_invoices.bank_paid_base IS 'Reeds betaald bedrag zonder bankledger, uitsluitend bewaard bij expliciete koppeling van extra betalingen.';
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='fin_link_purchase_bank';
 def:=replace(def,'IF paid=0 AND p.status=''betaald'' THEN paid:=p.total; END IF;','paid:=paid+p.bank_paid_base; IF paid=0 AND p.status=''betaald'' THEN paid:=p.total; IF _mode=''overpayment'' THEN UPDATE public.purchase_invoices SET bank_paid_base=p.total WHERE id=p.id; END IF; END IF;');
 EXECUTE def;
END $$;