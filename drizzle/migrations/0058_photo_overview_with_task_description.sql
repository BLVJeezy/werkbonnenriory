DROP FUNCTION IF EXISTS public.photo_overview();

CREATE OR REPLACE FUNCTION public.photo_overview()
 RETURNS TABLE(id uuid, path text, created_at timestamp with time zone, work_order_id uuid, number integer, customer_name text, city text, scheduled_date date, task_description text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.path, p.created_at, p.work_order_id, w.number, w.customer_name, coalesce(w.site_city, w.city), w.scheduled_date, w.description
  FROM public.work_order_photos p JOIN public.work_orders w ON w.id = p.work_order_id
  WHERE public.is_admin_or_marketing()
  ORDER BY p.created_at DESC
$function$;

GRANT EXECUTE ON FUNCTION public.photo_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.photo_overview() TO service_role;