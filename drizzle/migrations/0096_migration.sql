alter table public.work_orders add column if not exists reopened_at timestamptz;
create or replace function public.track_work_order_reopen() returns trigger language plpgsql set search_path=public as $$
begin
  if old.status = 'afgetekend' and new.status <> 'afgetekend' then new.reopened_at := now();
  elsif new.status = 'afgetekend' then new.reopened_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_track_work_order_reopen on public.work_orders;
create trigger trg_track_work_order_reopen before update of status on public.work_orders for each row execute function public.track_work_order_reopen();