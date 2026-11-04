import { OpenEye, useOpens } from "@/components/OpenEye";
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePerms, useRole } from '@/lib/use-role';
import { completedWorkOrderRows } from '@/lib/task-list';
import { destinationAddress } from '@/lib/address';
import { werkbonNr } from '@/lib/werkbon-number';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WorkOrderPreview } from '@/components/WorkOrderPreview';
import { WerkbonMailButton } from '@/components/WerkbonMailButton';
import { SortTh, Th, useSort, tableCls, tableWrap } from '@/components/SortTable';

export const Route = createFileRoute('/_authenticated/afgewerkte-werkbonnen')({
  head: () => ({ meta: [
    { title: 'Afgewerkte werkbonnen — Riory Werkbonnen' },
    { name: 'description', content: 'Overzicht van afgewerkte Riory-werkbonnen per klant, ploeg en datum.' },
    { property: 'og:title', content: 'Afgewerkte werkbonnen — Riory Werkbonnen' },
    { property: 'og:description', content: 'Overzicht van afgewerkte Riory-werkbonnen per klant, ploeg en datum.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: CompletedWorkOrders,
});

const completedQuery = () => supabase.from('work_orders')
  .select('id, number, customer_name, email, address, street, house_number, postal_code, city, use_site_address, site_street, site_house_number, site_postal_code, site_city, status, signed_at, paid_at, paid_method, scheduled_date, created_at, technician_id, technicians(name)')
  .eq('status', 'afgetekend').order('signed_at', { ascending: false, nullsFirst: false }).order('id');
type CompletedRow = NonNullable<Awaited<ReturnType<typeof completedQuery>>['data']>[number];
const completionDate = (row: CompletedRow) => row.signed_at ?? row.paid_at ?? row.scheduled_date ?? row.created_at;

function CompletedWorkOrders() {
  const role = useRole();
  const perms = usePerms();
  const allowed = role === 'admin' || (role === 'technician' && !!perms?.showSigned);
  const [search, setSearch] = useState('');
  const [crew, setCrew] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const { data = [], isPending, error } = useQuery({
    queryKey: ['work_orders', 'completed'],
    enabled: allowed,
    refetchInterval: 10000,
    queryFn: async () => {
      const result: CompletedRow[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data: batch, error } = await completedQuery().range(offset, offset + 499);
        if (error) throw error;
        result.push(...(batch ?? []));
        if (!batch || batch.length < 500) break;
      }
      return completedWorkOrderRows(result);
    },
  });
  const filtered = data.filter(row => {
    const date = new Date(completionDate(row)).toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
    const text = [row.number, row.customer_name, destinationAddress(row), row.technicians?.name].join(' ').toLocaleLowerCase('nl-BE');
    return text.includes(search.trim().toLocaleLowerCase('nl-BE')) && (!crew || row.technician_id === crew) && (!from || date >= from) && (!until || date <= until);
  });
  const sort = useSort(filtered, {
    nr: (row: CompletedRow) => row.number,
    klant: (row: CompletedRow) => row.customer_name,
    ploeg: (row: CompletedRow) => row.technicians?.name,
    datum: (row: CompletedRow) => completionDate(row),
  }, 'datum', 'desc');
  const crews = Array.from(new Map(data.filter(row => row.technician_id).map(row => [row.technician_id, row.technicians?.name ?? 'Onbekende ploeg'])).entries());

  if (!role || !perms) return <p className="text-muted-foreground">Laden…</p>;
  if (!allowed) return <p className="text-muted-foreground">Geen toegang tot afgewerkte werkbonnen.</p>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black uppercase sm:text-3xl">Afgewerkte werkbonnen</h1><p className="text-sm text-muted-foreground">{filtered.length} van {data.length} werkbonnen</p></div>
      <Button variant="outline" asChild><Link to="/werkbonnen">Taken</Link></Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="completed-search">Zoeken</Label><Input id="completed-search" placeholder="Klant, nummer, adres…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {role === 'admin' && <div className="space-y-1"><Label htmlFor="completed-crew">Ploeg</Label><select id="completed-crew" className="h-10 w-full rounded-md border bg-background px-2 text-foreground" value={crew} onChange={e => setCrew(e.target.value)}><option value="">Alle ploegen</option>{crews.map(([id, name]) => <option key={id} value={id ?? ''}>{name}</option>)}</select></div>}
      <div className="space-y-1"><Label htmlFor="completed-from">Afgewerkt vanaf</Label><Input id="completed-from" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="completed-until">Afgewerkt tot</Label><Input id="completed-until" type="date" value={until} onChange={e => setUntil(e.target.value)} /></div>
    </div>
    {error ? <p role="alert" className="text-destructive">Werkbonnen ophalen mislukt. Probeer opnieuw.</p> : isPending ? <p className="text-muted-foreground">Werkbonnen laden…</p> : <div className={tableWrap}>
      <table className={tableCls}><thead><tr><SortTh k="nr" sort={sort}>Nummer</SortTh><SortTh k="klant" sort={sort}>Klant</SortTh><SortTh k="ploeg" sort={sort}>Ploeg</SortTh><SortTh k="datum" sort={sort}>Afgewerkt op</SortTh><Th>Status</Th><Th>Werkbon</Th></tr></thead>
        <tbody>{sort.sorted.map(row => <tr key={row.id}>
          <td className="whitespace-nowrap font-mono"><span className="inline-flex items-center gap-1.5">{werkbonNr(row.number)}<OpenEye sent={!!opensW.data?.sent.has(row.id)} info={opensW.data?.opens[row.id]} /></span></td>
          <td className="min-w-48"><Link to="/werkbonnen/$id" params={{ id: row.id }} className="font-bold hover:underline">{row.customer_name}</Link><p className="text-xs text-muted-foreground">{destinationAddress(row)}</p></td>
          <td>{row.technicians?.name ?? 'Niet toegewezen'}</td>
          <td className="whitespace-nowrap">{new Date(completionDate(row)).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', dateStyle: 'short', ...(row.signed_at || row.paid_at ? { timeStyle: 'short' as const } : {}) })}</td>
          <td><Badge variant="secondary">{row.paid_method ? 'Afgerekend' : 'Afgewerkt'}</Badge></td>
          <td><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link to="/werkbonnen/$id" params={{ id: row.id }}>Openen</Link></Button><WorkOrderPreview workOrderId={row.id} /><WerkbonMailButton workOrderId={row.id} email={row.email} /></div></td>
        </tr>)}{sort.sorted.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground">Geen afgewerkte werkbonnen gevonden.</td></tr>}</tbody>
      </table>
    </div>}
  </div>;
}