create table public.customer_profile_changes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid,
  changed_by_email text,
  source text not null default 'klantenportaal',
  changes jsonb not null,
  created_at timestamptz not null default now()
);

create index customer_profile_changes_customer_idx on public.customer_profile_changes (customer_id, created_at desc);

GRANT SELECT ON public.customer_profile_changes TO authenticated;
GRANT ALL ON public.customer_profile_changes TO service_role;

alter table public.customer_profile_changes enable row level security;

create policy "Admins read customer profile changes" on public.customer_profile_changes for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));