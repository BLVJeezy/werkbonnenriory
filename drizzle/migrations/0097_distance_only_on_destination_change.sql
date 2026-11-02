CREATE OR REPLACE FUNCTION public.reset_work_order_address_distance() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Alleen wissen als de bestemming (werfadres of anders klantadres) echt verandert; een klantwissel met behouden werfadres houdt de kilometers.
  IF (CASE WHEN NEW.use_site_address THEN ROW(NEW.site_street, NEW.site_house_number, NEW.site_postal_code, NEW.site_city, NULL::text) ELSE ROW(NEW.street, NEW.house_number, NEW.postal_code, NEW.city, NEW.address) END)
     IS DISTINCT FROM
     (CASE WHEN OLD.use_site_address THEN ROW(OLD.site_street, OLD.site_house_number, OLD.site_postal_code, OLD.site_city, NULL::text) ELSE ROW(OLD.street, OLD.house_number, OLD.postal_code, OLD.city, OLD.address) END)
  THEN NEW.distance_km := NULL; END IF;
  RETURN NEW;
END; $$;