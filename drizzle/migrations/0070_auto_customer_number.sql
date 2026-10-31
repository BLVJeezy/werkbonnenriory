-- Elke klant krijgt automatisch een klantnummer in de aangeleverde 6-cijferige nummering.
create sequence if not exists public.customer_number_seq start 3085;

create or replace function public.assign_customer_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE nr text;
BEGIN
  IF NEW.customer_number IS NULL OR btrim(NEW.customer_number) = '' THEN
    NEW.customer_number := lpad(nextval('public.customer_number_seq')::text, 6, '0');
  END IF;
  IF NEW.customer_numbers IS NULL OR array_length(NEW.customer_numbers, 1) IS NULL THEN
    NEW.customer_numbers := ARRAY[NEW.customer_number];
  ELSIF NOT (NEW.customer_number = ANY(NEW.customer_numbers)) THEN
    NEW.customer_numbers := array_prepend(NEW.customer_number, NEW.customer_numbers);
  END IF;
  RETURN NEW;
END $$;

drop trigger if exists customers_assign_number on public.customers;
create trigger customers_assign_number before insert on public.customers
  for each row execute function public.assign_customer_number();

grant usage, select on sequence public.customer_number_seq to authenticated, service_role;
grant execute on function public.assign_customer_number() to authenticated, service_role;