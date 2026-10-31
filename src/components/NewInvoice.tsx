import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { allCustomers } from "@/lib/customers";
import { euro } from "@/lib/billing";
import { vatRateForCustomer } from "@/lib/vat-number";
import { buildManualInvoice, groupInvoiceLines, lineTotals, travelKmLine, type InvoiceLine } from "@/lib/invoice";
import { formatAddress } from "@/lib/address";
import { quoteDistance } from "@/lib/distance.functions";
import { createManualInvoice, updateInvoice } from "@/lib/invoices.functions";
import { splitLineText } from "@/lib/line-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPicker } from "@/components/CustomerPicker";
import { SearchSelect } from "@/components/SearchSelect";

type Line = { kind: "line"; title: string; detail: string; quantity: string; unit: string; unitPrice: string; vatRate: string; discount: string };
type Title = { kind: "title"; title: string; hidePrice: boolean };
type Item = Line | Title;
const VAT_OPTIONS = ["21", "12", "6", "0"];
const num = (v: string) => Number(v.replace(",", ".")) || 0;

type EditInvoice = { id: string; number: string; lines: unknown; vat_rate: number; contract_reference: string | null; customer: unknown; note?: string | null };

function itemsFromLines(lines: InvoiceLine[], fallbackVat: number): Item[] {
  const out: Item[] = [];
  let current: string | null = null;
  for (const l of lines) {
    const g = l.group?.trim() || null;
    if (g && g !== current) out.push({ kind: "title", title: g, hidePrice: !!l.hidePrice });
    current = g;
    const { title, detail } = splitLineText(l.description);
    out.push({ kind: "line", title, detail: detail ?? "", quantity: String(l.quantity), unit: l.unit, unitPrice: String(l.originalUnitPrice ?? l.unitPrice), vatRate: String(l.vatRate ?? fallbackVat), discount: l.discount ? String(l.discount) : "" });
  }
  return out;
}

export function NewInvoice({ onCreated, invoice }: { onCreated: () => void; invoice?: EditInvoice }) {
  const create = useServerFn(createManualInvoice);
  const update = useServerFn(updateInvoice);
  const editing = !!invoice;
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [defaultVat, setDefaultVat] = useState("21");
  const [kmOn, setKmOn] = useState(false);
  const [km, setKm] = useState<number | null>(null);
  const [kmVat, setKmVat] = useState<string | null>(null);
  const [kmBusy, setKmBusy] = useState(false);
  const calcKm = useServerFn(quoteDistance);
  const newLine = (): Line => ({ kind: "line", title: "", detail: "", quantity: "1", unit: "st", unitPrice: "", vatRate: defaultVat, discount: "" });
  const [items, setItems] = useState<Item[]>([]);
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], enabled: open, queryFn: () => allCustomers(supabase) });
  const { data: products = [] } = useQuery({ queryKey: ["products-invoice"], enabled: open, queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [] });
  const { data: settings } = useQuery({ queryKey: ["settings"], enabled: open, queryFn: async () => (await supabase.from("settings").select("km_rate, base_address").eq("id", 1).single()).data });
  const kmRate = Number(settings?.km_rate ?? 0);

  const parsed = useMemo(() => {
    let group: Title | null = null;
    const rows = [];
    for (const it of items) {
      if (it.kind === "title") { group = it.title.trim() ? it : null; continue; }
      rows.push({ description: [it.title.trim(), it.detail.trim()].filter(Boolean).join("\n"), quantity: num(it.quantity), unit: it.unit, unitPrice: num(it.unitPrice), vatRate: Number(it.vatRate) || 0, discount: num(it.discount), group: group?.title ?? null, hidePrice: group?.hidePrice ?? false });
    }
    const travel = kmOn ? travelKmLine(km, kmRate, Number(kmVat ?? defaultVat)) : null;
    return travel ? [...rows, travel] : rows;
  }, [items, kmOn, km, kmVat, kmRate, defaultVat]);
  const calc = useMemo(() => buildManualInvoice(parsed.filter((l) => l.description.trim())), [parsed]);
  const subtotals = useMemo(() => groupInvoiceLines(calc.lines).filter((s) => s.title), [calc]);

  function setItem(i: number, patch: Partial<Line> | Partial<Title>) {
    setItems((ls) => ls.map((x, j) => (j === i ? ({ ...x, ...patch } as Item) : x)));
  }
  function pickProduct(i: number, id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setItem(i, { title: p.name, detail: (p.description ?? "").trim(), unit: p.unit, unitPrice: String(p.price) });
  }

  function addressOf(c: Record<string, unknown> | null): string | null {
    if (!c) return null;
    const part = (snake: string, camel: string) => {
      const v = c[snake] ?? c[camel];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    return formatAddress({ street: part("street", "street"), house_number: part("house_number", "houseNumber"), postal_code: part("postal_code", "postalCode"), city: part("city", "city") });
  }

  function currentCustomer(): Record<string, unknown> | null {
    if (customerId) return (customers.find((x) => x.id === customerId) ?? null) as Record<string, unknown> | null;
    return (invoice?.customer as Record<string, unknown>) ?? null;
  }

  async function computeKm(c: Record<string, unknown> | null) {
    const address = addressOf(c);
    if (!address) { toast.error("De klant heeft geen adres"); return false; }
    setKmBusy(true);
    try {
      const r = await calcKm({ data: { address } });
      if (r.km == null) { toast.error("Afstand niet gevonden voor dit adres"); return false; }
      setKm(r.km);
      return true;
    } catch { toast.error("Afstand berekenen mislukt"); return false; }
    finally { setKmBusy(false); }
  }

  async function toggleKm(on: boolean) {
    if (!on) { setKmOn(false); setKm(null); setKmVat(null); return; }
    const c = currentCustomer();
    if (!c) { toast.error("Kies eerst een klant"); return; }
    if (await computeKm(c)) setKmOn(true);
  }

  function chooseCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    // BE/NL-btw-nummer verlegt de heffing (0%); Nederlandse particulieren 21%.
    const def = String(vatRateForCustomer(c.vat_number, 21, undefined, { postalCode: c.postal_code }));
    setDefaultVat(def);
    if (!editing && def !== "21") setItems((ls) => ls.map((l) => (l.kind === "line" ? { ...l, vatRate: def } : l)));
    // Kies je een andere klant terwijl kilometers aanstaan, dan hoort de afstand bij die klant.
    if (kmOn) { setKmVat(null); void computeKm(c as Record<string, unknown>); }
  }

  function start() {
    if (invoice) {
      setItems(itemsFromLines((invoice.lines as InvoiceLine[]) ?? [], Number(invoice.vat_rate)));
      setReference(invoice.contract_reference ?? "");
      setNote(invoice.note ?? "");
      setDefaultVat(String(invoice.vat_rate));
    } else setItems([newLine()]);
    setOpen(true);
  }
  function reset() { setOpen(false); setCustomerId(""); setReference(""); setNote(""); setItems([]); setDefaultVat("21"); }

  async function save() {
    try {
      if (invoice) {
        await update({ data: { invoiceId: invoice.id, customerId: customerId || null, reference, note, lines: parsed } });
        toast.success(`Factuur ${invoice.number} aangepast`);
      } else {
        if (!customerId) { toast.error("Kies eerst een klant"); return; }
        await create({ data: { customerId, reference: reference.trim() || null, note: note.trim() || null, lines: parsed } });
        toast.success("Factuur aangemaakt");
      }
      reset();
      onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  }

  if (!open) return editing
    ? <Button variant="outline" size="sm" onClick={start}>Aanpassen</Button>
    : <Button size="sm" onClick={start}>+ Nieuwe factuur</Button>;

  const productOptions = products.map((p) => ({ value: p.id, label: `${p.name} — ${euro(Number(p.price))}`, search: `${p.alias ?? ""} ${p.description ?? ""}` }));

  return (
    <div className="w-full space-y-4 rounded-md border bg-card p-4">
      <h3 className="text-lg font-black uppercase">{invoice ? `Factuur ${invoice.number} aanpassen` : "Nieuwe factuur"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Klant{invoice ? ` (huidig: ${(invoice.customer as { name?: string })?.name ?? "—"})` : ""}</Label>
          <CustomerPicker customers={customers} value={customerId} placeholder={invoice ? "Andere klant kiezen (optioneel)…" : "Kies klant…"} onChange={chooseCustomer} />
        </div>
        <div className="space-y-1">
          <Label>Betreft (referentie, optioneel)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="bv. Huur machine maart" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Factuurlijnen</Label>
        {items.map((it, i) => it.kind === "title" ? (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border-l-4 border-primary bg-muted p-2">
            <Input className="min-w-0 flex-1 font-bold" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Titel, bv. Dieptereiniging regenput" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={it.hidePrice} onChange={(e) => setItem(i, { hidePrice: e.target.checked })} />
              Prijzen eronder verbergen
            </label>
            <span className="font-mono text-sm font-bold">{euro(subtotals.find((s) => s.title === it.title.trim())?.subtotal ?? 0)}</span>
            <Button variant="outline" size="icon" aria-label="Titel verwijderen" onClick={() => setItems((ls) => ls.filter((_, j) => j !== i))}>✕</Button>
          </div>
        ) : (
          <div key={i} className="space-y-2 rounded-md border p-2">
            <SearchSelect placeholder="Product kiezen…" searchPlaceholder="Zoek product of alias…" value="" onChange={(id) => pickProduct(i, id)} options={productOptions} />
            <Input className="font-bold" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Product of naam van de lijn" aria-label="Productnaam" />
            <div className="grid gap-2 sm:grid-cols-[80px_64px_100px_80px_76px_40px] sm:items-start">
              <Input value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} placeholder="Aantal" aria-label="Aantal" inputMode="decimal" />
              <Input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} placeholder="eenheid" aria-label="Eenheid" />
              <Input value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} placeholder="Prijs" aria-label="Prijs" inputMode="decimal" />
              <Input value={it.discount} onChange={(e) => setItem(i, { discount: e.target.value })} placeholder="Korting %" aria-label="Korting %" inputMode="decimal" />
              <select aria-label="Btw" className="h-10 w-full rounded-md border bg-background px-2" value={it.vatRate} onChange={(e) => setItem(i, { vatRate: e.target.value })}>
                {VAT_OPTIONS.map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
              <Button variant="outline" size="icon" aria-label="Lijn verwijderen" disabled={items.filter((x) => x.kind === "line").length === 1} onClick={() => setItems((ls) => ls.filter((_, j) => j !== i))}>✕</Button>
            </div>
            {num(it.unitPrice) > 0 && (() => {
              const t = lineTotals({ quantity: num(it.quantity), unitPrice: num(it.unitPrice), discount: num(it.discount), vatRate: Number(it.vatRate) || 0 });
              return <p className="text-right font-mono text-sm text-muted-foreground">Lijntotaal: {euro(t.excl)} excl. btw · <strong className="text-foreground">{euro(t.incl)} incl. btw</strong></p>;
            })()}
            <Textarea rows={Math.min(6, Math.max(2, it.detail.split("\n").length))} value={it.detail} onChange={(e) => setItem(i, { detail: e.target.value })} placeholder="Lange omschrijving (optioneel, komt als bijvoegsel onder de productnaam)" aria-label="Lange omschrijving" className="text-sm" />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setItems((ls) => [...ls, newLine()])}>+ Lijn toevoegen</Button>
          <Button variant="outline" size="sm" onClick={() => setItems((ls) => [...ls, { kind: "title", title: "", hidePrice: false }, newLine()])}>+ Titel toevoegen</Button>
        </div>
        <p className="text-xs text-muted-foreground">Lijnen onder een titel worden op de factuur samengeteld bij die titel.</p>
      </div>

      <div className="space-y-1">
        <Label>Uitleg op de factuur (optioneel)</Label>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="bv. Extra werken op vraag van de klant uitgevoerd op 12/10." />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-sm">{euro(calc.net)} excl. btw · btw {euro(calc.vat)} · totaal <strong>{euro(calc.total)}</strong></span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={reset}>Annuleren</Button>
          <Button disabled={(!editing && !customerId) || !calc.lines.length} onClick={save}>{editing ? "Opslaan" : "Factuur aanmaken"}</Button>
        </div>
      </div>
    </div>
  );
}
