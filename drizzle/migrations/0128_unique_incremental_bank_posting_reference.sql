CREATE OR REPLACE FUNCTION public.fin_bank_part_reference(_transaction uuid, _allocated numeric, _parts numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT _transaction::text || ':' || (round((_allocated + _parts) * 100,0)::bigint)::text
$$;
REVOKE ALL ON FUNCTION public.fin_bank_part_reference(uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_bank_part_reference(uuid,numeric,numeric) TO authenticated,service_role;
DO $$ DECLARE def text; old_value text := '''bank-part'',t.id::text,jsonb_build_array'; new_value text := '''bank-part'',public.fin_bank_part_reference(t.id,allocated,parts),jsonb_build_array'; BEGIN
 SELECT pg_get_functiondef('public.fin_split_bank_payment(uuid,jsonb)'::regprocedure) INTO def;
 IF strpos(def,old_value)=0 THEN RAISE EXCEPTION 'Onverwachte definitie deelaflettering'; END IF;
 EXECUTE replace(def,old_value,new_value);
END $$;