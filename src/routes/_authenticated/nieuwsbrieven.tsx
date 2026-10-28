import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save, Eye, Send, ChevronLeft, ChevronRight, Sparkles, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getNewsletters, saveNewsletterCampaign, saveNewsletterConsent, previewNewsletter, newsletterHistory } from '@/lib/newsletters.functions';
import { campaignSchema, consentSchema } from '@/lib/newsletters';
import { generateNewsletter } from '@/lib/newsletter-ai.functions';

const options = queryOptions({ queryKey: ['newsletters'], queryFn: () => getNewsletters() });
export const Route = createFileRoute('/_authenticated/nieuwsbrieven')({
  loader: ({ context }) => context.queryClient.ensureQueryData(options),
  head: () => ({ meta: [{ title: 'Nieuwsbrieven — Riory Werkbonnen' }, { name: 'description', content: 'Riory-nieuwsbriefconcepten en marketingtoestemming beheren.' }, { property: 'og:title', content: 'Nieuwsbrieven — Riory Werkbonnen' }, { property: 'og:description', content: 'Campagnes en klanttoestemming van Riory.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: Newsletters,
});
type Form = { id?: string; name: string; subject: string; body: string };
const empty: Form = { name: '', subject: '', body: '' };
function Newsletters() {
  const { data } = useSuspenseQuery(options);
  const qc = useQueryClient();
  const save = useServerFn(saveNewsletterCampaign), consentSave = useServerFn(saveNewsletterConsent), preview = useServerFn(previewNewsletter), history = useServerFn(newsletterHistory);
  const [tab, setTab] = useState<'campaigns' | 'consent'>('campaigns');
  const [form, setForm] = useState<Form | null>(null);
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const generate = useServerFn(generateNewsletter);
  const [aiText, setAiText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [suggestion, setSuggestion] = useState<Omit<Form, 'id'> | null>(null);
  async function generateDraft() {
    setGenerating(true); setAiError(''); setSuggestion(null);
    try {
      const result = await generate({ data: { text: aiText } });
      if (!result.draft) { setAiError(result.error ?? 'Genereren mislukt.'); return; }
      setSuggestion(result.draft);
    } catch (e) { setAiError(e instanceof Error ? e.message : 'Genereren mislukt. Jouw tekst is behouden.'); }
    finally { setGenerating(false); }
  }
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<'subscribed' | 'unsubscribed'>('subscribed');
  const [evidence, setEvidence] = useState(''), [link, setLink] = useState('');
  const [events, setEvents] = useState<Awaited<ReturnType<typeof newsletterHistory>>>([]);
  const rows = data.customers.filter(c => `${c.name} ${c.email ?? ''} ${c.customer_number ?? ''}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || (filter === 'subscribed' ? c.eligible : filter === 'unsubscribed' ? c.consent?.status === 'unsubscribed' : !c.eligible && c.consent?.status !== 'unsubscribed')));
  async function act(fn: () => Promise<void>) { setBusy(true); try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'); } finally { setBusy(false); } }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black uppercase">Nieuwsbrieven</h1><span className="ml-auto font-mono text-sm">{data.recipients} ontvangers met toestemming</span></div>
    <div className="border-l-4 border-primary bg-muted px-4 py-3 text-sm">Geen nieuwsbriefdienst gekoppeld. Concepten en toestemming zijn beschikbaar; verzending staat uit.</div>
    <div className="flex gap-2 border-b pb-3"><Button variant={tab === 'campaigns' ? 'default' : 'outline'} onClick={() => setTab('campaigns')}>Campagnes</Button><Button variant={tab === 'consent' ? 'default' : 'outline'} onClick={() => setTab('consent')}>Toestemming</Button></div>
    {tab === 'campaigns' ? <div className="space-y-4">
      <Button onClick={() => { setForm({ ...empty }); setHtml(''); setAiText(''); setSuggestion(null); setAiError(''); }}><Plus className="size-4" />Nieuwe campagne</Button>
      {form && <form className="space-y-4 border-y py-5" onSubmit={e => { e.preventDefault(); void act(async () => { const parsed = campaignSchema.parse(form); const saved = await save({ data: parsed }); setForm({ ...parsed, id: saved.id }); await qc.invalidateQueries({ queryKey: options.queryKey }); toast.success('Concept opgeslagen'); }); }}>
        <div className="space-y-3 border-l-4 border-primary pl-4">
          <label className="block space-y-1"><span className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />Jouw tekst voor de nieuwsbrief</span><Textarea value={aiText} maxLength={12000} disabled={generating} onChange={e => setAiText(e.target.value)} placeholder="Bijvoorbeeld: We willen klanten informeren over dieptereiniging van regenputten…" className="min-h-28" /></label>
          <Button type="button" variant="outline" disabled={generating || !aiText.trim()} onClick={() => void generateDraft()}>{generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{generating ? 'Nieuwsbrief maken…' : 'Nieuwsbrief genereren'}</Button>
          {aiError && <p role="alert" className="text-sm text-destructive">{aiError}</p>}
          {suggestion && <div className="space-y-3 border-t pt-3"><h2 className="font-bold">AI-voorstel</h2><p className="font-semibold break-words">{suggestion.subject}</p><p className="whitespace-pre-wrap break-words text-sm">{suggestion.body}</p><Button type="button" disabled={busy} onClick={() => { setForm({ ...suggestion, id: form.id }); setHtml(''); setSuggestion(null); toast.success('Voorstel overgenomen'); }}>Voorstel overnemen</Button></div>}
        </div>
        <label className="block space-y-1"><span className="text-sm font-semibold">Campagnenaam</span><Input value={form.name} required maxLength={160} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block space-y-1"><span className="text-sm font-semibold">Onderwerp</span><Input value={form.subject} required maxLength={200} onChange={e => setForm({ ...form, subject: e.target.value })} /></label>
        <label className="block space-y-1"><span className="text-sm font-semibold">Bericht</span><Textarea className="min-h-48" value={form.body} required maxLength={30000} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
        <div className="text-sm text-muted-foreground">Afzender: Riory · info@riory.be · {data.recipients} ontvangers</div>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}><Save className="size-4" />{busy ? 'Bezig…' : 'Concept opslaan'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void act(async () => setHtml((await preview({ data: campaignSchema.parse(form) })).html))}><Eye className="size-4" />Voorbeeld</Button><Button type="button" disabled title="Eerst een nieuwsbriefdienst koppelen"><Send className="size-4" />Versturen</Button><Button type="button" variant="ghost" onClick={() => { setForm(null); setHtml(''); }}>Sluiten</Button></div>
        {html && <iframe title="Voorbeeld nieuwsbrief" srcDoc={html} sandbox="" className="h-[650px] w-full border bg-background" />}
      </form>}
      <div className="divide-y">{data.campaigns.length === 0 ? <p className="py-5 text-muted-foreground">Nog geen campagnes.</p> : data.campaigns.map(c => <div key={c.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><strong className="break-words">{c.name}</strong><p className="break-words text-sm text-muted-foreground">{c.subject}</p></div><span className="text-xs font-mono">Concept</span><Button variant="outline" size="sm" disabled={generating} onClick={() => { setForm({ id: c.id, name: c.name, subject: c.subject, body: c.body }); setHtml(''); setAiText(''); setSuggestion(null); setAiError(''); }}>Bewerken</Button></div>)}</div>
    </div> : <div className="space-y-4">
      <div className="flex flex-wrap gap-3"><Input className="min-w-0 flex-1" placeholder="Klant of e-mailadres zoeken…" aria-label="Klant zoeken" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><select className="rounded border border-input bg-background px-3 py-2 text-sm" aria-label="Toestemmingsfilter" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">Alle klanten</option><option value="subscribed">Met toestemming</option><option value="none">Zonder geldige toestemming</option><option value="unsubscribed">Uitgeschreven</option></select></div>
      <div className="divide-y">{rows.slice(page * 25, page * 25 + 25).map(c => <div key={c.id} className="py-4 space-y-3"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><strong className="break-words">{c.name}</strong><p className="break-all text-sm text-muted-foreground">{c.email || 'Geen klantmailadres'}</p></div><span className={`text-sm ${c.eligible ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{c.eligible ? 'Toestemming' : c.consent?.status === 'unsubscribed' ? 'Uitgeschreven' : 'Geen geldige toestemming'}</span><Button variant="outline" size="sm" disabled={!c.email} onClick={() => void act(async () => { setSelected(c.id); setStatus(c.eligible ? 'unsubscribed' : 'subscribed'); setEvidence(''); setLink(''); setEvents(await history({ data: { customerId: c.id } })); })}>Beheren</Button></div>
        {selected === c.id && <div className="space-y-3 border-l-2 border-primary pl-4">
          <div className="flex flex-wrap gap-2"><Button size="sm" variant={status === 'subscribed' ? 'default' : 'outline'} onClick={() => setStatus('subscribed')}>Toestemming vastleggen</Button><Button size="sm" variant={status === 'unsubscribed' ? 'default' : 'outline'} onClick={() => setStatus('unsubscribed')}>Uitschrijven</Button></div>
          <label className="block space-y-1"><span className="text-sm font-semibold">{status === 'subscribed' ? 'Bron, datum en bewijs van toestemming' : 'Reden / verzoek van de klant'}</span><Textarea aria-label="Bewijs van toestemming" value={evidence} maxLength={2000} onChange={e => setEvidence(e.target.value)} /></label>
          <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void act(async () => { const saved = await consentSave({ data: consentSchema.parse({ customerId: c.id, status, evidence }) }); setLink(saved.unsubscribeUrl); setEvents(await history({ data: { customerId: c.id } })); await qc.invalidateQueries({ queryKey: options.queryKey }); toast.success('Toestemming bijgewerkt'); })}>Opslaan</Button><Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Sluiten</Button></div>
          {link && <label className="block space-y-1"><span className="text-sm font-semibold">Persoonlijke uitschrijflink</span><Input readOnly value={link} onFocus={e => e.target.select()} /></label>}
          {events.length > 0 && <div className="space-y-2"><h3 className="text-sm font-bold">Historiek</h3>{events.map(ev => <div key={ev.id} className="text-sm"><span className="font-mono text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString('nl-BE')}</span> · {ev.status === 'subscribed' ? 'Toestemming' : 'Uitgeschreven'}<p className="whitespace-pre-wrap break-words text-muted-foreground">{ev.evidence}</p></div>)}</div>}
        </div>}
      </div>)}</div>
      <div className="flex items-center justify-between"><span className="text-sm">{rows.length} klanten · pagina {page + 1}</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Vorige pagina" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Volgende pagina" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </div>}
  </div>;
}