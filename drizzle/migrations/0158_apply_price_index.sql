CREATE OR REPLACE FUNCTION public.apply_price_index(_pct numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p int; a int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Alleen de beheerder mag prijzen indexeren'; END IF;
  IF _pct IS NULL OR _pct <= 0 OR _pct > 50 THEN RAISE EXCEPTION 'Index moet tussen 0 en 50%% liggen'; END IF;
  UPDATE public.products SET price = round(price * (1 + _pct/100), 2) WHERE price > 0;
  GET DIAGNOSTICS p = ROW_COUNT;
  UPDATE public.activities SET hourly_rate = round(hourly_rate * (1 + _pct/100), 2) WHERE hourly_rate > 0;
  GET DIAGNOSTICS a = ROW_COUNT;
  RETURN jsonb_build_object('products', p, 'activities', a);
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_price_index(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_price_index(numeric) TO authenticated;