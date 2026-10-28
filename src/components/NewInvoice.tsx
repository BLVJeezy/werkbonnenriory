import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { allCustomers } from "@/lib/customers";
import { euro } from "@/lib/billing";
import { vatRateForCustomer } from "@/lib/vat-number";
import { buildManualInvoice } from "@/lib/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Line = { description: string; quantity: string; unit: string; unitPrice: string; vatRate: string };
const emptyLine: Line = { description: "", quantity: "1", unit: "st", unitPrice: "", vatRate: "21" };
const VAT_OPTIONS = ["21", "12", "6", "0"];

export function NewInvoice({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [customerLabel, setCustomerLabel] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], enabled: open, queryFn: () => allCustomers(supabase) });
  const lab = (c: any) => [c.customer_number, c.name, [c.street, c.house_number].filter(Boolean).join(" "), c.city].filter(Boolean).join(" — ");
  const chosen = customers.find((c: any) => lab(c) === customerLabel);

  const parsed = useMemo(() => lines.map((l) => ({ description: l.description, quantity: Number(l.quantity.replace(",", ".")) || 0, unit: l.unit, unitPrice: Number(l.unitPrice.replace(",", ".")) || 0, vatRate: Number(l.vatRate) || 0 })), [lines]);
  const calc = useMemo(() => buildManualInvoice(parsed), [parsed]);

  function pick(c: any) {
    setCustomerLabel(lab(c));
    // BE-btw-nummer verlegt de heffing (0%); particulier met oudere woning krijgt 6%.
    const def = vatRateForCustomer(c.vat_number, c.customer_type, c.house_older_than_10y);
    if (def != null) setLines((ls) => ls.map((l) => ({ ...l, vatRate: String(def) })));
  }

  async function save() {
    if (!chosen) { toast.error("Kies eerst een klant"); return; }
    if (!lines.some((l) => l.description.trim())) { toast.error("Vul minstens één lijn met omschrijving in"); return; }
    try {
      const { data, error } = await supabase.rpc("next_invoice_number");
      void data;
      if (error) throw error;
    } catch { /* nummering gebeurt op de server; deze controle is vooraf */ }
    try {
      const { createManualInvoice } = await import("@/lib/invoices.functions");
      const fn = createManualInvoice;
      void fn;
    } catch { /* alleen types */ }
    onSaved();
  }

  async function onSaved() {
    const { createManualInvoice } = await import("@/lib/invoices.functions");
    try {
      await createManualInvoice({ data: { customerId: chosen.id, reference: reference.trim() || null, lines: parsed } });
      toast.success("Factuur aangemaakt");
      setOpen(false); setCustomerLabel(""); setReference(""); setLines([{ ...emptyLine }]);
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
          <Input list="new-invoice-customers" value={customerLabel} onChange={(e) => { setCustomerLabel(e.target.value); const c = customers.find((x: any) => lab(x) === e.target.value); if (c) pick(c); }} placeholder="Zoek op klantnummer, naam of adres" />
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
            <div className="space-y-1"><Label className="sr-only">Omschrijving</Label>
              <Input value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Omschrijving" /></div>
            <div className="space-y-1"><Label className="sr-only">Aantal</Label>
              <Input value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} placeholder="Aantal" inputMode="decimal" /></div>
            <div className="space-y-1"><Label className="sr-only">Eenheid</Label>
              <Input value={l.unit} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} placeholder="eenheid" /></div>
            <div className="space-y-1"><Label className="sr-only">Prijs</Label>
              <Input value={l.unitPrice} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} placeholder="Prijs" inputMode="decimal" /></div>
            <div className="space-y-1"><Label className="sr-only">Btw</Label>
              <select aria-label="Btw" className="h-10 w-full rounded-md border bg-background px-2" value={l.vatRate} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, vatRate: e.target.value } : x)))}>
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
          <Button variant="outline" onClick={() => { setOpen(false); setCustomerLabel(""); setReference(""); setLines([{ ...emptyLine }]); }}>Annuleren</Button>
          <Button disabled={!chosen || !lines.some((l) => l.description.trim())} onClick={onSaved}>Factuur aanmaken</Button>
        </div>
      </div>
    </div>
  );
}
