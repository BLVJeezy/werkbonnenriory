CREATE OR REPLACE FUNCTION public.forward_external_appointment(p_id uuid,p_instruction text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.work_orders; t public.technicians; r_id uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Alleen voor beheerder'; END IF;
 IF length(trim(p_instruction))<1 OR length(p_instruction)>4000 THEN RAISE EXCEPTION 'Vul een prijsloze werkomschrijving in'; END IF;
 SELECT * INTO w FROM public.work_orders WHERE id=p_id FOR UPDATE;
 IF w.id IS NULL OR w.status='afgetekend' OR w.technician_id IS NULL THEN RAISE EXCEPTION 'Wijs eerst een externe ploeg toe aan een open taak'; END IF;
 SELECT * INTO t FROM public.technicians WHERE id=w.technician_id;
 IF NOT t.external_planning OR t.user_id IS NOT NULL OR t.email IS NULL OR w.email IS NULL THEN RAISE EXCEPTION 'Externe ploeg of e-mailadres ontbreekt'; END IF;
 UPDATE public.work_orders SET scheduled_date=NULL,scheduled_from=NULL,scheduled_until=NULL WHERE id=w.id;
 INSERT INTO public.appointment_requests(work_order_id,technician_id,customer_email,crew_email,instruction,mail_pending) VALUES(w.id,t.id,w.email,t.email,trim(p_instruction),'crew') ON CONFLICT(work_order_id) DO UPDATE SET technician_id=excluded.technician_id,customer_email=excluded.customer_email,crew_email=excluded.crew_email,instruction=excluded.instruction,status='crew_pending',crew_token=gen_random_uuid(),customer_token=gen_random_uuid(),expires_at=now()+interval '30 days',proposed_date=NULL,time_from=NULL,time_until=NULL,confirmed_at=NULL,mail_pending='crew',mail_error=NULL,mail_sent_at=NULL,mail_lock_until=NULL,version=appointment_requests.version+1 RETURNING id INTO r_id;
 RETURN r_id;
END $$;
REVOKE ALL ON FUNCTION public.forward_external_appointment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.forward_external_appointment(uuid,text) TO authenticated;
ALTER TABLE public.appointment_requests ADD CONSTRAINT appointment_valid_slot CHECK (proposed_date IS NULL OR (time_from IS NOT NULL AND time_until IS NOT NULL AND time_until>time_from));