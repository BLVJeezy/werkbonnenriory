import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { euro, VAT_RATES } from "@/lib/billing";
import { formatAddress } from "@/lib/address";
import type { InvoiceCustomer, InvoiceLine } from "@/lib/invoice";
import { quoteLine, quoteTotals, QUOTE_STATUS } from "@/lib/quote";
import { splitLineText } from "@/lib/line-text";
import { assignQuoteCrew, convertQuoteToTask, createQuote, quotePdf, sendQuote, updateQuote } from "@/lib/quotes.functions";
import { quoteDistance } from "@/lib/distance.functions";
import { vatRateForCustomer } from "@/lib/vat-number";
import { DocumentReport } from '@/components/DocumentReport';
import { allCustomers } from '@/lib/customers';
import { CustomerPicker } from '@/components/CustomerPicker';
import { SearchSelect } from '@/components/SearchSelect';
import { InsurancePhotoPicker } from '@/components/InsurancePhotoPicker';
import { suggestInsuranceQuote } from '@/lib/insurance-quote-ai.functions';

export const Route = createFileRoute("/_authenticated/offertes")({
  validateSearch: (s: Record<string, unknown>): { bewerk?: string } => (typeof s["bewerk"] === "string" ? { bewerk: s["bewerk"] } : {}),
  head: () => ({ meta: [{ title: "Offertes — Riory Werkbonnen" }, { name: "description", content: "Riory-offertes maken, versturen ter ondertekening en omzetten in taken." }, { property: "og:title", content: "Offertes — Riory Werkbonnen" }, { property: "og:description", content: "Riory-offertes maken, versturen ter ondertekening en omzetten in taken." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Offertes,
});

type Line = { title: string; detail: string; quantity: string; unit: string; unitPrice: string };
const emptyLine: Line = { title: "", detail: "", quantity: "1", unit: "st", unitPrice: "" };
/** The stored line text keeps its old shape: product name on the first line, long description below it. */
const lineText = (l: Line) => [l.title.trim(), l.detail.trim()].filter(Boolean).join("\n");

function Offertes() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { bewerk } = Route.useSearch();
  const create = useServerFn(createQuote);
  const update = useServerFn(updateQuote);
  const send = useServerFn(sendQuote);
  const getPdf = useServerFn(quotePdf);
  const convert = useServerFn(convertQuoteToTask);
  const assignCrew = useServerFn(assignQuoteCrew);
  const calcKm = useServerFn(quoteDistance);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCustomer, setEditCustomer] = useState<InvoiceCustomer | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [vatRate, setVatRate] = useState("21");
  const [intro, setIntro] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [kmOn, setKmOn] = useState(false);
  const [km, setKm] = useState<number | null>(null);
  const [kmBusy, setKmBusy] = useState(false);
  const [kind, setKind] = useState<"offerte" | "verzekering">("offerte");
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [damageCause, setDamageCause] = useState("");
  const [damageFindings, setDamageFindings] = useState("");
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [aiNotes, setAiNotes] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const suggest = useServerFn(suggestInsuranceQuote);
  const bestek = kind === "verzekering";

  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => (await supabase.from("quotes").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => allCustomers(supabase),
  });
  const { data: crews = [] } = useQuery({
    queryKey: ["quote_crews"],
    queryFn: async () => (await supabase.from("technicians").select("id, name").order("name")).data ?? [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("km_rate, base_address").eq("id", 1).single()).data,
  });
  const kmRate = Number(settings?.km_rate ?? 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ["quotes"] });

  const parsedLines: InvoiceLine[] = [
    ...lines
      .filter((l) => lineText(l))
      .map((l) => quoteLine(lineText(l), Number(l.quantity) || 1, l.unit || "st", Number(l.unitPrice.replace(",", ".")) || 0)),
    ...(kmOn && km ? [quoteLine(`Verplaatsing heen en terug (${km} km)`, km, "km", kmRate)] : []),
  ];
  const totals = quoteTotals(parsedLines, Number(vatRate));

  async function toggleKm(on: boolean) {
    setKmOn(on);
    if (!on) { setKm(null); return; }
    const c = (editCustomer ?? customers.find((x) => x.id === customerId) ?? null) as Record<string, string | null | undefined> | null;
    const address = c
      ? formatAddress({
          street: c["street"] ?? null,
          house_number: c["house_number"] ?? c["houseNumber"] ?? null,
          postal_code: c["postal_code"] ?? c["postalCode"] ?? null,
          city: c["city"] ?? null,
        })
      : null;
    if (!address) { toast.error("De klant heeft geen adres"); setKmOn(false); return; }
    setKmBusy(true);
    try {
      const r = await calcKm({ data: { address } });
      if (r.km == null) { toast.error("Afstand niet gevonden voor dit adres"); setKmOn(false); }
      else setKm(r.km);
    } catch { toast.error("Afstand berekenen mislukt"); setKmOn(false); }
    setKmBusy(false);
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (p) {
      setLine(i, { title: p.name, detail: (p.description ?? "").trim(), unit: p.unit, unitPrice: String(p.price) });
    }
  }

  function openEdit(q: (typeof quotes)[number]) {
    setEditId(q.id);
    setEditCustomer(q.customer as InvoiceCustomer);
    setVatRate(String(q.vat_rate));
    setIntro(q.intro ?? "");
    setKind(q.kind === "verzekering" ? "verzekering" : "offerte");
    setEditCustomerId(q.customer_id ?? null);
    setDamageCause(q.damage_cause ?? "");
    setDamageFindings(q.damage_findings ?? "");
    setPhotoPaths(q.photo_paths ?? []);
    const all = q.lines as InvoiceLine[];
    const kmLine = all.find((l) => l.unit === "km");
    setKmOn(!!kmLine);
    setKm(kmLine ? kmLine.quantity : null);
    const ls = all.filter((l) => l.unit !== "km").map((l) => {
      const t = splitLineText(l.description);
      return { title: t.title, detail: t.detail ?? "", quantity: String(l.quantity), unit: l.unit, unitPrice: String(l.unitPrice) };
    });
    setLines(ls.length ? ls : [{ ...emptyLine }]);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setEditCustomer(null);
    setCustomerId("");
    setIntro("");
    setLines([{ ...emptyLine }]);
    setKmOn(false);
    setKm(null);
    setKind("offerte"); setEditCustomerId(null); setDamageCause(""); setDamageFindings(""); setPhotoPaths([]); setAiNotes("");
    if (bewerk) navigate({ to: "/offertes", search: {}, replace: true });
  }

  // Open the quote for editing when arriving from a task (?bewerk=<id>)
  useEffect(() => {
    if (!bewerk || editId === bewerk) return;
    const q = quotes.find((x) => x.id === bewerk);
    if (q) openEdit(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bewerk, quotes]);

  async function preview(id: string, win?: Window | null) {
    const w = win ?? window.open("", "_blank");
    const r = await getPdf({ data: { quoteId: id } });
    const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    if (w) w.location.href = url;
    else toast.error("Pop-up geblokkeerd — sta pop-ups toe voor deze site");
  }

  async function maak(e: React.FormEvent) {
    e.preventDefault();
    let customer: InvoiceCustomer | null = editCustomer;
    if (!editId) {
      const c = customers.find((x) => x.id === customerId);
      if (!c) { toast.error("Kies een klant"); return; }
      customer = {
        name: c.name, address: formatAddress(c) || null, siteAddress: null, vatNumber: c.vat_number, email: c.billing_email || c.email,
        street: c.street, houseNumber: c.house_number, postalCode: c.postal_code, city: c.city,
      };
    }
    if (!parsedLines.length) { toast.error("Voeg minstens één lijn toe"); return; }
    if (!customer) { toast.error("Kies een klant"); return; }
    setBusy(true);
    const win = window.open("", "_blank");
    const extra = { kind, customerId: editId ? editCustomerId : customerId, damageCause, damageFindings, photoPaths };
    try {
      const saved = editId
        ? await update({ data: { quoteId: editId, customer, lines: parsedLines, vatRate: Number(vatRate), intro, ...extra } })
        : await create({ data: { customer, lines: parsedLines, vatRate: Number(vatRate), intro, ...extra } });
      toast.success(bestek ? (editId ? "Bestek bijgewerkt" : "Bestek aangemaakt") : editId ? "Offerte bijgewerkt" : "Offerte aangemaakt");
      const id = saved.id as string;
      closeForm();
      refresh();
      await preview(id, win);
    } catch (e) {
      win?.close();
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
    setBusy(false);
  }

  async function aiVoorstel() {
    setAiBusy(true);
    try {
      const r = await suggest({ data: { notes: aiNotes, photoPaths: photoPaths.slice(0, 8) } });
      if (!r.draft) { toast.error(r.error ?? "Geen voorstel"); return; }
      const d = r.draft;
      if (d.intro) setIntro(d.intro);
      setDamageCause(d.cause);
      setDamageFindings(d.findings);
      const keep = lines.filter((l) => lineText(l));
      setLines([...keep, ...d.lines.map((l) => {
        const t = splitLineText(l.description);
        return { title: t.title, detail: t.detail ?? "", quantity: String(l.quantity || 1), unit: l.unit || "st", unitPrice: "" };
      })]);
      toast.success("Voorstel ingevuld — kijk alles na en vul de prijzen in");
    } catch (e) { toast.error(e instanceof Error ? e.message : "AI-voorstel mislukt"); }
    finally { setAiBusy(false); }
  }

  async function verstuur(id: string) {
    if (!confirm("Offerte nu mailen naar de klant? De mail bevat een link om digitaal te ondertekenen.")) return;
    setBusy(true);
    try {
      await send({ data: { quoteId: id } });
      toast.success("Offerte verzonden");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verzenden mislukt"); }
    setBusy(false);
    refresh();
  }

  async function download(id: string) {
    const r = await getPdf({ data: { quoteId: id } });
    const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Offerte-${r.number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  async function naarTaak(id: string) {
    setBusy(true);
    try {
      const r = await convert({ data: { quoteId: id } });
      toast.success("Taak aangemaakt vanuit de offerte");
      navigate({ to: "/werkbonnen/$id", params: { id: r.workOrderId } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Omzetten mislukt"); setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <h1 className="text-3xl font-black uppercase">Offertes</h1>
        <Button className="ml-auto" variant="outline" onClick={() => (showForm ? closeForm() : setShowForm(true))}>{showForm ? "Sluiten" : "+ Offerte maken"}</Button>
      </div>

      {showForm && (
        <form onSubmit={maak} className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Soort">
            {([["offerte", "Gewone offerte"], ["verzekering", "Bestek brandverzekering"]] as const).map(([k, label]) => (
              <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label>Klant</Label>
              {editId ? (
                <p className="flex h-10 items-center rounded-md border bg-muted px-2 font-bold">{editCustomer?.name}</p>
              ) : (
                <CustomerPicker customers={customers} value={customerId} placeholder="Kies klant…" onChange={(id) => {
                  setCustomerId(id);
                  setKm(null);
                  if (kmOn) setKmOn(false);
                  const c = customers.find((x) => x.id === id);
                  if (c) setVatRate(String(vatRateForCustomer(c.vat_number ?? "", Number(vatRate), undefined, { postalCode: c.postal_code, vrijBeroep: !!c.vrij_beroep })));
                }} />
              )}
            </div>
            <div className="space-y-1">
              <Label>Btw</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2" value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
                {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
          {bestek && (
            <div className="space-y-3 rounded-md border border-primary/40 bg-muted/40 p-3">
              <div className="space-y-1">
                <Label>Foto’s van de schade</Label>
                <InsurancePhotoPicker customerId={editId ? editCustomerId : customerId || null} value={photoPaths} onChange={setPhotoPaths} />
              </div>
              <div className="space-y-1">
                <Label>Notities voor de AI (wat is er gebeurd, wat zag je ter plaatse)</Label>
                <Textarea rows={3} placeholder="bv. Brand in keuken op 12/10 door frietketel. Plafond zwart van roet, kasten verbrand, muren rookschade in living…" value={aiNotes} onChange={(e) => setAiNotes(e.target.value)} />
                <Button type="button" size="sm" variant="outline" disabled={aiBusy || (!aiNotes.trim() && !photoPaths.length)} onClick={() => void aiVoorstel()}>{aiBusy ? "AI schrijft voorstel…" : "AI-voorstel maken"}</Button>
                <p className="text-xs text-muted-foreground">De AI vult oorzaak, vaststellingen en posten in op basis van je notities en de eerste 8 gekozen foto’s. Prijzen vul je zelf in. Kijk alles na: de verzekeraar beslist zelf over de dekking.</p>
              </div>
              <div className="space-y-1">
                <Label>Oorzaak van de schade</Label>
                <Textarea rows={3} value={damageCause} onChange={(e) => setDamageCause(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Vaststellingen</Label>
                <Textarea rows={5} value={damageFindings} onChange={(e) => setDamageFindings(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>{bestek ? "Posten" : "Lijnen"}</Label>
            {lines.map((l, i) => (
              <div key={i} className="space-y-1.5 rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input placeholder="Product of post" className="min-w-40 flex-1 basis-full font-bold sm:basis-0" value={l.title} onChange={(e) => setLine(i, { title: e.target.value })} aria-label="Productnaam" />
                  <SearchSelect className="basis-full sm:w-64 sm:basis-auto" placeholder="Product kiezen…" searchPlaceholder="Zoek product of alias…" value="" onChange={(id) => pickProduct(i, id)} options={products.map(p => ({ value: p.id, label: p.name, search: `${p.alias ?? ''} ${p.description ?? ''}` }))} />
                  <Input type="number" step="any" min="0" className="w-20" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label="Aantal" />
                  <Input className="w-16" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-label="Eenheid" />
                  <Input type="number" step="0.01" min="0" placeholder="Prijs" className="w-28" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-label="Prijs" />
                  <Button type="button" size="sm" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>✕</Button>
                </div>
                <Textarea placeholder="Lange omschrijving (optioneel, als bijvoegsel onder de productnaam)" rows={Math.min(8, Math.max(2, l.detail.split("\n").length))} className="min-h-10 text-sm" value={l.detail} onChange={(e) => setLine(i, { detail: e.target.value })} aria-label="Lange omschrijving" />
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>+ Lijn toevoegen</Button>
          </div>
          <div className="space-y-1">
            <Label>Betreft (tekst bovenaan de offerte)</Label>
            <Textarea rows={2} placeholder="bv. Betreft: renovatie badkamer — zoals besproken op de werf" value={intro} onChange={(e) => setIntro(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={kmOn} disabled={kmBusy} onChange={(e) => void toggleKm(e.target.checked)} />
            Kilometers aanrekenen (heen en terug vanaf {settings?.base_address ?? "het vertrekadres"})
            {kmBusy && <span className="font-normal text-muted-foreground">berekenen…</span>}
            {kmOn && km != null && <span className="font-mono font-normal">{km} km × {euro(kmRate)} = {euro(km * kmRate)}</span>}
          </label>
          <p className="font-mono text-sm">Totaal: {euro(totals.net)} excl. btw · {euro(totals.total)} incl. btw</p>
          <Button disabled={busy}>{busy ? "Opslaan…" : editId ? "Opslaan en voorbeeld tonen" : bestek ? "Bestek aanmaken en voorbeeld tonen" : "Aanmaken en voorbeeld tonen"}</Button>
        </form>
      )}

      <ul className="divide-y rounded-md border bg-card">
        {quotes.length === 0 && <li className="p-4 text-muted-foreground">Nog geen offertes.</li>}
        {quotes.map((q) => {
          const c = q.customer as InvoiceCustomer;
          return (
            <li key={q.id} className="grid min-w-0 grid-cols-2 items-center gap-2 p-3 sm:flex sm:flex-wrap sm:gap-3">
              <span className="font-mono font-bold">{q.number}{q.kind === "verzekering" && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 font-sans text-xs text-primary-foreground">Bestek</span>}</span>
              <span className="col-span-full row-start-1 min-w-0 break-words font-semibold sm:flex-1">{c.name}</span>
              <select aria-label={`Ploeg offerte ${q.number}`} className="col-span-full h-10 w-full min-w-0 rounded-md border bg-background px-2 text-foreground sm:h-9 sm:w-auto" disabled={busy} value={q.technician_id ?? ""} onChange={async (e) => {
                setBusy(true);
                try {
                  await assignCrew({ data: { quoteId: q.id, technicianId: e.target.value || null } });
                  await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["work_orders"] })]);
                  toast.success("Ploeg toegewezen aan offerte");
                } catch (error) { toast.error(error instanceof Error ? error.message : "Toewijzen mislukt"); }
                finally { setBusy(false); }
              }}>
                <option value="">— Ploeg —</option>
                {crews.map((crew) => <option key={crew.id} value={crew.id}>{crew.name}</option>)}
              </select>
              <span className="font-mono">{euro(Number(q.total))}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${q.status === "akkoord" ? "bg-accent text-accent-foreground" : "bg-muted"}`}>
                {QUOTE_STATUS[q.status] ?? q.status}
              </span>
              {q.signed_name && <span className="text-xs text-muted-foreground">door {q.signed_name}</span>}
              <Button variant="outline" size="sm" onClick={() => preview(q.id)}>Voorbeeld</Button>
              <Button variant="outline" size="sm" onClick={() => download(q.id)}>PDF</Button>
              <DocumentReport id={q.id} type="offerte" />
              {q.status !== "akkoord" && <Button variant="outline" size="sm" disabled={busy} onClick={() => openEdit(q)}>Bewerken</Button>}
              {q.status !== "akkoord" && <Button size="sm" disabled={busy} onClick={() => verstuur(q.id)}>{q.status === "verzonden" ? "Opnieuw versturen" : "Versturen"}</Button>}
              {q.status === "akkoord" && !q.work_order_id && <Button size="sm" disabled={busy} onClick={() => naarTaak(q.id)}>Omzetten in taak</Button>}
              {q.work_order_id && <Button asChild variant="outline" size="sm"><a href={`/werkbonnen/${q.work_order_id}`}>Taak openen</a></Button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
