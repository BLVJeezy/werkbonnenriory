import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { allCustomers } from "@/lib/customers";
import { euro } from "@/lib/billing";
import { vatRateForCustomer } from "@/lib/vat-number";
import { buildManualInvoice } from "@/lib/invoice";
import { createManualInvoice } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Line = { description: string; quantity: string; unit: string; unitPrice: string; vatRate: string };
const emptyLine: Line = { description: "", quantity: "1", unit: "st", unitPrice: "", vatRate: "21" };
const VAT_OPTIONS = ["21", "12", "6", "0"];
const num = (v: string) => Number(v.replace(",", ".")) || 0;

export function NewInvoice({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createManualInvoice);
  const [open, setOpen] = useState(false);
  const [customerLabel, setCustomerLabel] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], enabled: open, queryFn: () => allCustomers(supabase) });
  const lab = (c: any) => [c.customer_number, c.name, [c.street, c.house_number].filter(Boolean).join(" "), c.city].filter(Boolean).join(" — ");
  const chosen = customers.find((c: any) => lab(c) === customerLabel);

  const parsed = useMemo(() => lines.map((l) => ({ description: l.description, quantity: num(l.quantity), unit: l.unit, unitPrice: num(l.unitPrice), vatRate: Number(l.vatRate) || 0 })), [lines]);
  const calc = useMemo(() => buildManualInvoice(parsed), [parsed]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function chooseCustomer(label: string) {
    setCustomerLabel(label);
    const c = customers.find((x: any) => lab(x) === label);
    if (!c) return;
    // BE-btw-nummer verlegt de heffing (0%); particulier met oudere woning krijgt 6%.
    const def = vatRateForCustomer(c.vat_number, c.customer_type, c.house_older_than_10y);
    if (def != null) setLines((ls) => ls.map((l) => ({ ...l, vatRate: String(def) })));
  }

  function reset() { setOpen(false); setCustomerLabel(""); setReference(""); setLines([{ ...emptyLine }]); }

  async function save() {
    if (!chosen) { toast.error("Kies eerst een klant"); return; }
    try {
      await create({ data: { customerId: chosen.id, reference: reference.trim() || null, lines: parsed } });
      toast.success("Factuur aangemaakt");
      reset();
      onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Aanmaken mislukt"); }
  }

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ Nieuwe factuur</Button>;

  return (
    <div className="space-y-4 rounded-md border bg-card p-4">
      <h3 className="text-lg font-black uppercase">Nieuwe factuur</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Klant</Label>
          <Input list="new-invoice-customers" value={customerLabel} onChange={(e) => chooseCustomer(e.target.value)} placeholder="Zoek op klantnummer, naam of adres" />
          <datalist id="new-invoice-customers">{customers.map((c: any) => <option key={c.id} value={lab(c)} />)}</datalist>
        </div>
        <div className="space-y-1">
          <Label>Betreft (referentie, optioneel)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="bv. Huur machine maart" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Factuurlijnen</Label>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_90px_70px_110px_80px_40px] sm:items-end">
            <div><Label className="sr-only">Omschrijving</Label>
              <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Omschrijving" /></div>
            <div><Label className="sr-only">Aantal</Label>
              <Input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder="Aantal" inputMode="decimal" /></div>
            <div><Label className="sr-only">Eenheid</Label>
              <Input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="eenheid" /></div>
            <div><Label className="sr-only">Prijs</Label>
              <Input value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} placeholder="Prijs" inputMode="decimal" /></div>
            <div><Label className="sr-only">Btw</Label>
              <select aria-label="Btw" className="h-10 w-full rounded-md border bg-background px-2" value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })}>
                {VAT_OPTIONS.map((v) => <option key={v} value={v}>{v}%</option>)}
              </select></div>
            <Button variant="outline" size="icon" aria-label="Lijn verwijderen" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>+ Lijn toevoegen</Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-sm">{euro(calc.net)} excl. btw · btw {euro(calc.vat)} · totaal <strong>{euro(calc.total)}</strong></span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={reset}>Annuleren</Button>
          <Button disabled={!chosen || !lines.some((l) => l.description.trim())} onClick={save}>Factuur aanmaken</Button>
        </div>
      </div>
    </div>
  );
}
