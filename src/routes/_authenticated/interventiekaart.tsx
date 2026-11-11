import { lazy, Suspense, useMemo, useState } from 'react';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { List, MapPin, RefreshCw, Search, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InterventionLocationDetails } from '@/components/InterventionLocationDetails';
import { canAccessInterventionMap, emptyMapFilters, filterInterventions, groupInterventions, located, locationCount, mergeSimplaLocations, type MapFilters } from '@/lib/intervention-map';
import { getInterventionPage, geocodeInterventionBatch, getSimplaMapLocations } from '@/lib/intervention-map.functions';
import { useRole } from '@/lib/use-role';

const MapView = lazy(() => import('@/components/InterventionMap'));
export const Route = createFileRoute('/_authenticated/interventiekaart')({
  head: () => ({ meta: [
    { title: 'Interventiekaart — Riory Werkbonnen' },
    { name: 'description', content: 'Intern locatieoverzicht van uitgevoerde Riory-interventies en historische werkbonnen.' },
    { property: 'og:title', content: 'Interventiekaart — Riory Werkbonnen' },
    { property: 'og:description', content: 'Beveiligd overzicht van echte Riory-interventies per locatie.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex,nofollow' },
  ] }), component: InterventionPage,
});

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string,string][] }) {
  return <label className="min-w-0 text-xs font-semibold text-muted-foreground">{label}<Select value={value || 'all'} onValueChange={value => onChange(value === 'all' ? '' : value)}><SelectTrigger className="mt-1 w-full" aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle</SelectItem>{options.map(([id,name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></label>;
}
function InterventionPage() {
  const role = useRole(); const allowed = canAccessInterventionMap(role);
  const fetchPage = useServerFn(getInterventionPage); const fetchSimpla = useServerFn(getSimplaMapLocations); const geocode = useServerFn(geocodeInterventionBatch);
  const [filters, setFilters] = useState<MapFilters>(emptyMapFilters); const [view,setView] = useState('map');
  const [selected, setSelected] = useState<string | null>(null); const [scope, setScope] = useState('all'); const [page,setPage] = useState(0); const [busy,setBusy] = useState(false); const [progress,setProgress] = useState('');
  const query = useInfiniteQuery({ queryKey: ['intervention-map'], enabled: allowed, initialPageParam: 0, queryFn: ({ pageParam }) => fetchPage({ data: { offset: pageParam } }), getNextPageParam: page => page.next ?? undefined });
  const rows = useMemo(() => query.data?.pages.flatMap(p => p.rows) ?? [], [query.data]);
  const simpla = useQuery({ queryKey: ['intervention-map', 'simpla'], enabled: allowed, staleTime: 5 * 60_000, queryFn: () => fetchSimpla() });
  const caches = useMemo(() => [...(query.data?.pages.flatMap(p => p.caches) ?? []), ...(simpla.data?.caches ?? [])], [query.data, simpla.data]);
  const simplaRows = useMemo(() => simpla.data?.rows ?? [], [simpla.data]);
  const groups = useMemo(() => mergeSimplaLocations(groupInterventions(filterInterventions(rows,filters), caches), simplaRows, caches, filters), [rows,filters,caches,simplaRows]);
  const allGroups = useMemo(() => mergeSimplaLocations(groupInterventions(rows,caches), simplaRows, caches, emptyMapFilters), [rows,caches,simplaRows]);
  const missing = groups.filter(g => !located(g.cache)); const mapped = groups.length - missing.length;
  const visible = scope === 'missing' ? missing : scope === 'located' ? groups.filter(g => located(g.cache)) : groups;
  const configured = query.data?.pages[0]?.configured ?? false;
  const crews: [string,string][] = [...new Map(rows.filter(r => r.technician_id).map(r => [r.technician_id ?? '', r.technicians?.name ?? 'Onbekende ploeg'])).entries()];
  const activities: [string,string][] = [...new Map(rows.filter(r => r.activity_id).map(r => [r.activity_id ?? '', r.activities?.name ?? 'Onbekende activiteit'])).entries()];
  function change(key: keyof MapFilters,value: string) { setFilters(f => ({ ...f, [key]: value })); setPage(0); }
  if (!role) return <p>Laden…</p>;
  if (!allowed) return <p role="alert">Alleen beheerders hebben toegang tot de interventiekaart.</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black uppercase sm:text-3xl">Interventiekaart</h1><p className="text-sm text-muted-foreground">{rows.length} uitgevoerde werkbonnen · {simplaRows.length} Simpla-klantadressen · {allGroups.length} locaties</p></div><Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''} size={16} />Vernieuwen</Button></div>
    {query.error && <p role="alert" className="border-l-4 border-destructive bg-muted p-3">{query.error instanceof Error ? query.error.message : 'Werkbonnen laden mislukt.'}</p>}
    {query.isPending && <p role="status">Werkbonnen ophalen…</p>}
    {simpla.isPending && <p role="status">Simpla-adressen ophalen…</p>}
    {simpla.data?.error && <p role="alert" className="border-l-4 border-destructive bg-muted p-3">Simpla-adressen konden niet geladen worden: {simpla.data.error}</p>}
    {query.hasNextPage && <div className="flex flex-wrap items-center gap-3 border-l-4 border-primary bg-muted p-3"><p className="text-sm">Het overzicht is nog onvolledig.</p><Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Laden…' : 'Volgende 500 werkbonnen laden'}</Button></div>}
    <div className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-xs font-semibold text-muted-foreground">Vanaf<Input className="mt-1" aria-label="Vanaf" type="date" value={filters.from} onChange={e => change('from',e.target.value)} /></label>
      <label className="text-xs font-semibold text-muted-foreground">Tot en met<Input className="mt-1" aria-label="Tot en met" type="date" value={filters.until} onChange={e => change('until',e.target.value)} /></label>
      <Choice label="Ploeg" value={filters.crew} onChange={v => change('crew',v)} options={crews} />
      <Choice label="Soort interventie" value={filters.activity} onChange={v => change('activity',v)} options={activities} />
      <Choice label="Status werkbon" value={filters.status} onChange={v => change('status',v)} options={ [['afgetekend','Afgetekend'],['paid','Afgerekend'],['unpaid','Niet afgerekend'],['no_invoice','Niet factureren'],['subcontract','Onderaannemer']] } />
      <Button variant="ghost" className="self-end" onClick={() => { setFilters(emptyMapFilters);setScope('all');setPage(0); }}>Filters wissen</Button>
      <div className="relative sm:col-span-2 lg:col-span-6"><Search className="absolute left-3 top-3 text-muted-foreground" size={17} /><Input aria-label="Zoeken op adres of klant" placeholder="Zoek adres, klant of werkbonnummer…" className="pl-9" value={filters.search} onChange={e => change('search',e.target.value)} /></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={view === 'map' ? 'default' : 'outline'} onClick={() => setView('map')}><MapPin size={16} />Kaart</Button><Button variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')}><List size={16} />Lijst</Button>
      <div className="ml-auto flex flex-wrap gap-2"><Button size="sm" variant={scope === 'all' ? 'secondary' : 'ghost'} onClick={() => {setScope('all');setPage(0);}}>Alle {groups.length}</Button><Button size="sm" variant={scope === 'located' ? 'secondary' : 'ghost'} onClick={() => {setScope('located');setPage(0);}}>Op kaart {mapped}</Button><Button size="sm" variant={scope === 'missing' ? 'secondary' : 'ghost'} onClick={() => {setScope('missing');setPage(0);}}>Zonder locatie {missing.length}</Button></div>
    </div>
    {view === 'map' && <ClientOnly fallback={<div className="h-[480px] bg-muted" />}><Suspense fallback={<div className="h-[480px] bg-muted" />}><MapView locations={visible} selected={selected} onSelect={setSelected} /></Suspense></ClientOnly>}
    {missing.length > 0 && <div className="space-y-2 border-l-4 border-primary bg-muted p-3"><p className="font-semibold">{missing.length} adressen zonder locatie</p><p className="text-sm text-muted-foreground">{configured ? `Google Maps-adresopzoeking actief · maximaal ${query.data?.pages[0]?.budget} aanvragen per dag.` : 'Google Maps is nog niet gekoppeld. Je kunt coördinaten per adres handmatig opslaan; er worden geen adressen extern opgezocht.'}</p>
      {configured && (() => { const todo = allGroups.filter(g => !g.cache && !g.key.startsWith('missing:')); return <Button disabled={busy || !todo.length} onClick={async () => {
        if (!window.confirm(`${todo.length} nieuwe adressen naar Google Maps sturen om de locatie op te zoeken? Dit kost ongeveer €${Math.ceil(todo.length * 0.005)} en duurt enkele minuten.`)) return;
        setBusy(true); let found = 0, failed = 0, stop: string | null = null;
        try {
          for (let i = 0; i < todo.length && !stop; i += 25) {
            const batch = todo.slice(i, i + 25); const ids = batch.flatMap(g => g.orders[0] ? [g.orders[0].id] : []); const simplaIds = batch.flatMap(g => !g.orders[0] && g.simpla?.[0] ? [g.simpla[0].id] : []);
            const result = await geocode({ data: { ids, simplaIds } }); found += result.found; failed += result.failed;
            if (result.stopped === 'budget' || result.stopped === 'disabled') stop = result.stopped; else if (result.stopped) await new Promise(r => setTimeout(r, 1500));
            setProgress(`${Math.min(i + 25, todo.length)} / ${todo.length} · ${found} gevonden`);
          }
          toast.info(`${found} gevonden, ${failed} zonder exacte locatie${stop === 'budget' ? ' · Dagbudget bereikt' : ''}`);
        } catch(error) { toast.error(error instanceof Error ? error.message : 'Opzoeken mislukt.'); } finally { setBusy(false); setProgress(''); await Promise.all([query.refetch(), simpla.refetch()]); }
      }}><LocateFixed size={16} />{busy ? `Opzoeken… ${progress}` : `Alle ${todo.length} nieuwe adressen opzoeken`}</Button>; })()}
    </div>}
    <div className="divide-y border-y">{visible.slice(page*50,page*50+50).map(location => <div key={location.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words font-bold">{location.address}</p><p className="break-words text-sm text-muted-foreground">{location.customers.join(' · ')}</p><p className="font-mono text-xs text-muted-foreground">{locationCount(location)} interventies{location.simpla?.length ? ' (incl. Simpla)' : ''} · laatste {location.latest} · {located(location.cache) ? 'Op kaart' : 'Zonder locatie'}</p></div><Button size="sm" variant="outline" onClick={() => setSelected(location.key)}>Werkbonnen / locatie</Button></div>)}{!query.isPending && !visible.length && <p className="py-8 text-center text-muted-foreground">Geen interventies binnen deze selectie.</p>}</div>
    {visible.length > 50 && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={!page} onClick={() => setPage(p => p-1)}>Vorige</Button><span className="text-sm">{page+1} / {Math.ceil(visible.length/50)}</span><Button variant="outline" disabled={(page+1)*50 >= visible.length} onClick={() => setPage(p => p+1)}>Volgende</Button></div>}
    <InterventionLocationDetails location={groups.find(g => g.key === selected) ?? null} configured={configured} onClose={() => setSelected(null)} />
  </div>;
}