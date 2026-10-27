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
import { convertQuoteToTask, createQuote, quotePdf, sendQuote, updateQuote } from "@/lib/quotes.functions";
import { vatRateForCustomer } from "@/lib/vat-number";

export const Route = createFileRoute("/_authenticated/offertes")({
  validateSearch: (s: Record<string, unknown>) => ({ bewerk: typeof s.bewerk === "string" ? s.bewerk : undefined }),
  head: () => ({ meta: [{ title: "Offertes — Riory Werkbonnen" }, { name: "description", content: "Riory-offertes maken, versturen ter ondertekening en omzetten in taken." }, { property: "og:title", content: "Offertes — Riory Werkbonnen" }, { property: "og:description", content: "Riory-offertes maken, versturen ter ondertekening en omzetten in taken." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Offertes,
});

type Line = { description: string; quantity: string; unit: string; unitPrice: string };
const emptyLine: Line = { description: "", quantity: "1", unit: "st", unitPrice: "" };

function Offertes() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { bewerk } = Route.useSearch();
  const create = useServerFn(createQuote);
  const update = useServerFn(updateQuote);
  const send = useServerFn(sendQuote);
  const getPdf = useServerFn(quotePdf);
  const convert = useServerFn(convertQuoteToTask);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCustomer, setEditCustomer] = useState<InvoiceCustomer | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [vatRate, setVatRate] = useState("21");
  const [intro, setIntro] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);

  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => (await supabase.from("quotes").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["quotes"] });

  const parsedLines: InvoiceLine[] = lines
    .filter((l) => l.description.trim())
    .map((l) => quoteLine(l.description.trim(), Number(l.quantity) || 1, l.unit || "st", Number(l.unitPrice.replace(",", ".")) || 0));
  const totals = quoteTotals(parsedLines, Number(vatRate));

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (p) setLine(i, { description: p.name, unit: p.unit, unitPrice: String(p.price) });
  }

  function openEdit(q: (typeof quotes)[number]) {
    setEditId(q.id);
    setEditCustomer(q.customer as InvoiceCustomer);
    setVatRate(String(q.vat_rate));
    setIntro(q.intro ?? "");
    const ls = (q.lines as InvoiceLine[]).map((l) => ({ description: l.description, quantity: String(l.quantity), unit: l.unit, unitPrice: String(l.unitPrice) }));
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
    if (bewerk) navigate({ to: "/offertes", search: {}, replace: true });
  }

  // Open the quote for editing when arriving from a task (?bewerk=<id>)
  useEffect(() => {
    if (!bewerk || editId === bewerk) return;
    const q = quotes.find((x) => x.id === bewerk);
    if (q) openEdit(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bewerk, quotes]);

  async function preview(id: string) {
    const r = await getPdf({ data: { quoteId: id } });
    const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank");
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
    setBusy(true);
    try {
      const saved = editId
        ? await update({ data: { quoteId: editId, customer: customer!, lines: parsedLines, vatRate: Number(vatRate), intro } })
        : await create({ data: { customer: customer!, lines: parsedLines, vatRate: Number(vatRate), intro } });
      toast.success(editId ? "Offerte bijgewerkt" : "Offerte aangemaakt");
      const id = saved.id as string;
      closeForm();
      refresh();
      await preview(id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
    setBusy(false);
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
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black uppercase">Offertes</h1>
        <Button className="ml-auto" variant="outline" onClick={() => setShowForm((v) => !v)}>{showForm ? "Sluiten" : "+ Offerte maken"}</Button>
      </div>

      {showForm && (
        <form onSubmit={maak} className="space-y-3 rounded-md border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Klant</Label>
              <select required className="h-10 w-full rounded-md border bg-background px-2" value={customerId} onChange={(e) => {
                setCustomerId(e.target.value);
                const c = customers.find((x) => x.id === e.target.value);
                if (c) setVatRate(String(vatRateForCustomer(c.vat_number ?? "", Number(vatRate))));
              }}>
                <option value="">— Kies klant —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Btw</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2" value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
                {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Lijnen</Label>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input list="offerte-producten" placeholder="Omschrijving (of kies product)" className="min-w-48 flex-1" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <select className="h-10 rounded-md border bg-background px-2" value="" onChange={(e) => e.target.value && pickProduct(i, e.target.value)}>
                  <option value="">Product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Input type="number" step="any" min="0" className="w-20" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Input className="w-16" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                <Input type="number" step="0.01" min="0" placeholder="Prijs" className="w-28" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                <Button type="button" size="sm" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>✕</Button>
              </div>
            ))}
            <datalist id="offerte-producten">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>+ Lijn toevoegen</Button>
          </div>
          <p className="font-mono text-sm">Totaal: {euro(totals.net)} excl. btw · {euro(totals.total)} incl. btw</p>
          <Button disabled={busy}>{busy ? "Opslaan…" : "Offerte aanmaken"}</Button>
        </form>
      )}

      <ul className="divide-y rounded-md border bg-card">
        {quotes.length === 0 && <li className="p-4 text-muted-foreground">Nog geen offertes.</li>}
        {quotes.map((q) => {
          const c = q.customer as InvoiceCustomer;
          return (
            <li key={q.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="font-mono font-bold">{q.number}</span>
              <span className="flex-1">{c.name}</span>
              <span className="font-mono">{euro(Number(q.total))}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${q.status === "akkoord" ? "bg-accent text-accent-foreground" : "bg-muted"}`}>
                {QUOTE_STATUS[q.status] ?? q.status}
              </span>
              {q.signed_name && <span className="text-xs text-muted-foreground">door {q.signed_name}</span>}
              <Button variant="outline" size="sm" onClick={() => download(q.id)}>PDF</Button>
              {q.status !== "akkoord" && <Button size="sm" disabled={busy} onClick={() => verstuur(q.id)}>{q.status === "verzonden" ? "Opnieuw versturen" : "Versturen"}</Button>}
              {q.status === "akkoord" && !q.work_order_id && <Button size="sm" disabled={busy} onClick={() => naarTaak(q.id)}>Omzetten in taak</Button>}
              {q.work_order_id && <span className="text-xs text-muted-foreground">Taak aangemaakt</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
