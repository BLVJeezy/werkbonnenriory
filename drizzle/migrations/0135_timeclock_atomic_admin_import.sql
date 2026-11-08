CREATE OR REPLACE FUNCTION public.tk_import_snapshot(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t text; n integer; counts jsonb := '{}'::jsonb; incoming jsonb; existing jsonb; key_columns text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Alleen beheerders kunnen een tikklokexport overnemen'; END IF;
 IF jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Ongeldige export'; END IF;
 FOR t IN SELECT jsonb_object_keys(p_data) LOOP
  IF t NOT IN ('tk_employees','tk_approved_devices','tk_time_entries','tk_employee_profiles','tk_employee_absences','tk_employee_documents','tk_employee_notes','tk_payroll_profiles','tk_payroll_settings','tk_payroll_runs','tk_leave_requests','tk_employee_messages','tk_employee_message_reads','tk_company_settings','tk_employment_contracts','tk_overtime_adjustments','tk_employee_hours_history','tk_calendar_events','tk_calendar_notification_reads','tk_calendar_settings','tk_birthday_email_jobs','tk_employee_incidents','tk_time_entry_requests','tk_monthly_report_jobs','tk_source_user_roles') THEN RAISE EXCEPTION 'Onbekend exportonderdeel'; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['tk_employees','tk_approved_devices','tk_source_user_roles','tk_company_settings','tk_payroll_settings','tk_calendar_settings','tk_time_entries','tk_employee_profiles','tk_employee_absences','tk_employee_documents','tk_employee_notes','tk_payroll_profiles','tk_payroll_runs','tk_leave_requests','tk_employee_messages','tk_employee_message_reads','tk_employment_contracts','tk_overtime_adjustments','tk_employee_hours_history','tk_calendar_events','tk_calendar_notification_reads','tk_birthday_email_jobs','tk_employee_incidents','tk_time_entry_requests','tk_monthly_report_jobs'] LOOP
  IF NOT p_data ? t OR jsonb_typeof(p_data->t) <> 'array' THEN RAISE EXCEPTION 'Onvolledige export: %',t; END IF;
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I,$1) ON CONFLICT DO NOTHING',t,t) USING p_data->t;
  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object(t,n);
  FOR incoming IN SELECT value FROM jsonb_array_elements(p_data->t) LOOP
   IF t='tk_employee_profiles' THEN key_columns := 'employee_id';
   ELSIF t='tk_calendar_notification_reads' THEN key_columns := 'employee_id,notification_key,occurrence_date';
   ELSE key_columns := 'id'; END IF;
   EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE %s',t,(SELECT string_agg(format('to_jsonb(r)->%L = $1->%L',k,k),' AND ') FROM unnest(string_to_array(key_columns,',')) k)) INTO existing USING incoming;
   IF existing IS NULL OR NOT existing @> incoming THEN RAISE EXCEPTION 'Export wijkt af van bestaande tikklokgegevens in %; niets overgenomen',t; END IF;
  END LOOP;
 END LOOP;
 RETURN counts;
END $$;
REVOKE ALL ON FUNCTION public.tk_import_snapshot(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tk_import_snapshot(jsonb) TO authenticated;