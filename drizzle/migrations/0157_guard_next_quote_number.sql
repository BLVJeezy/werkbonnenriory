CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE settings SET next_quote_number = next_quote_number + 1 WHERE id = 1 RETURNING next_quote_number - 1 INTO n;
  RETURN 'OFF-' || n;
END
$$;
REVOKE EXECUTE ON FUNCTION public.next_quote_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_quote_number() TO authenticated;