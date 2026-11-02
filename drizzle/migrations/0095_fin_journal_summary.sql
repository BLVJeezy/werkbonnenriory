create or replace function public.fin_journal_summary(_company uuid, _until date)
 returns table(entry_date date, account text, source text, debit numeric, credit numeric)
 language sql
 stable
 security invoker
 set search_path = 'public'
as $$
  select date_trunc('month', e.entry_date)::date, l.account, e.source, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
  from public.fin_journal_lines l
  join public.fin_journal_entries e on e.id = l.entry_id
  where l.company_id = _company and e.entry_date <= _until
  group by 1, 2, 3
  order by 1, 2, 3
$$;

grant execute on function public.fin_journal_summary(uuid, date) to authenticated;