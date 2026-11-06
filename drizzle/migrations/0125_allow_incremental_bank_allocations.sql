ALTER TABLE public.fin_bank_allocations ADD COLUMN entry_id uuid REFERENCES public.fin_journal_entries(id);
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.fin_split_bank_payment(uuid,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'parts numeric:=0;', 'parts numeric:=0; allocated numeric:=0;');
 def:=replace(def,'jsonb_array_length(_allocations)<2','jsonb_array_length(_allocations)<1');
 def:=replace(def,'Kies 2 tot 50 facturen','Kies 1 tot 50 facturen');
 def:=replace(def,'IF NOT FOUND THEN RAISE EXCEPTION ''Deze verrichting is al gebruikt''; END IF;', 'IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.fin_bank_allocations WHERE transaction_id=t.id) THEN RAISE EXCEPTION ''Deze verrichting is al gebruikt''; END IF; SELECT coalesce(sum(amount),0) INTO allocated FROM public.fin_bank_allocations WHERE transaction_id=t.id;');
 def:=replace(def,'VALUES(t.id,t.company_id,uid,p.id,part);','VALUES(t.id,t.company_id,uid,p.id,part) ON CONFLICT(transaction_id,purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;');
 def:=replace(def,'VALUES(t.id,t.company_id,uid,f.id,part);','VALUES(t.id,t.company_id,uid,f.id,part) ON CONFLICT(transaction_id,invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET amount=fin_bank_allocations.amount+EXCLUDED.amount;');
 def:=replace(def,'IF round(parts,2)<>round(abs(t.amount),2) THEN RAISE EXCEPTION ''De verdeling (%) moet gelijk zijn aan de betaling (%)'',parts,abs(t.amount); END IF;', 'IF round(parts+allocated,2)>round(abs(t.amount),2) THEN RAISE EXCEPTION ''De verdeling overschrijdt het nog openstaande bankbedrag''; END IF;');
 def:=replace(def,'greatest(t.amount,0)','CASE WHEN t.amount>0 THEN parts ELSE 0 END');
 def:=replace(def,'greatest(-t.amount,0)','CASE WHEN t.amount<0 THEN parts ELSE 0 END');
 def:=replace(def,'''bank'',t.id::text,jsonb_build_array','''bank-part'',t.id::text,jsonb_build_array');
 def:=replace(def,'UPDATE public.fin_bank_tx SET entry_id=entry WHERE id=t.id;', 'UPDATE public.fin_bank_allocations SET entry_id=entry WHERE transaction_id=t.id AND ((invoice_id::text IN (SELECT value->>''id'' FROM jsonb_array_elements(_allocations))) OR (purchase_invoice_id::text IN (SELECT value->>''id'' FROM jsonb_array_elements(_allocations)))); UPDATE public.fin_bank_tx SET entry_id=CASE WHEN round(parts+allocated,2)=round(abs(t.amount),2) THEN entry ELSE NULL END WHERE id=t.id;');
 def:=replace(def,'''invoices'',jsonb_array_length(_allocations)', '''invoices'',jsonb_array_length(_allocations),''bankRemaining'',round(abs(t.amount)-parts-allocated,2)');
 EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION public.fin_protect_bank_part_entry() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF OLD.source='bank-part' THEN RAISE EXCEPTION 'Een gedeeltelijk afgeletterde betaling kan niet als losse boeking verwijderd worden'; END IF; RETURN OLD; END $$;
CREATE TRIGGER protect_bank_part_delete BEFORE DELETE ON public.fin_journal_entries FOR EACH ROW EXECUTE FUNCTION public.fin_protect_bank_part_entry();