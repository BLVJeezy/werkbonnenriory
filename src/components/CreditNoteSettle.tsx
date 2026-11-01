import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/SearchSelect";
import { euro } from "@/lib/billing";

type Inv = { id: string; number: string; kind: string; total: number; paid_amount: number; credit_for: string | null; customer: unknown };

/** Creditnota verrekenen met een open factuur (standaard de oorspronkelijke) of een manuele terugbetaling boeken. */
export function CreditNoteSettle({ credit, invoices, onDone }: { credit: Inv; invoices: Inv[]; onDone: () => void }) {
  const openAmount = Math.round((Math.abs(Number(credit.total)) - Math.abs(Number(credit.paid_amount))) * 100) / 100;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"offset" | "refund">("offset");
  const openInvoices = invoices.filter((i) => i.kind !== "creditnota" && Number(i.total) - Number(i.paid_amount) > 0.005);
  const [invoiceId, setInvoiceId] = useState(openInvoices.some((i) => i.id === credit.credit_for) ? credit.credit_for! : "");
  const [amount, setAmount] = useState(String(openAmount));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  if (openAmount <= 0.005) return null;
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Verrekenen / terugbetalen</Button>;

  const name = (i: Inv) => (i.customer as { name?: string })?.name ?? "";
  const options = openInvoices.map((i) => ({ value: i.id, label: `${i.number} — ${name(i)} — open ${euro(Number(i.total) - Number(i.paid_amount))}${i.id === credit.credit_for ? " (oorspronkelijke factuur)" : ""}`, search: name(i) }));

  async function save() {
    const amt = Number(amount.replace(",", "."));
    if (!(amt > 0)) { toast.error("Vul een bedrag in"); return; }
    if (mode === "offset" && !invoiceId) { toast.error("Kies een factuur"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("settle_credit_note", { p_credit: credit.id, p_invoice: (mode === "offset" ? invoiceId : null) as unknown as string, p_amount: amt, p_date: date });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(mode === "offset" ? "Creditnota verrekend met de factuur" : "Terugbetaling geboekt");
    setOpen(false);
    onDone();
  }

  return (
    <div className="w-full space-y-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === "offset" ? "default" : "outline"} onClick={() => setMode("offset")}>Verrekenen met factuur</Button>
        <Button size="sm" variant={mode === "refund" ? "default" : "outline"} onClick={() => setMode("refund")}>Terugbetaling boeken</Button>
      </div>
      {mode === "offset" && (
        <div className="space-y-1">
          <Label>Factuur die met deze creditnota wordt afgeboekt</Label>
          {options.length ? <SearchSelect options={options} value={invoiceId} onChange={setInvoiceId} placeholder="Kies factuur…" /> : <p className="text-sm text-muted-foreground">Er zijn geen openstaande facturen.</p>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Bedrag (max. {euro(openAmount)})</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="space-y-1"><Label>Datum</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Annuleren</Button>
        <Button size="sm" disabled={busy} onClick={save}>{mode === "offset" ? "Afboeken" : "Terugbetaling opslaan"}</Button>
      </div>
    </div>
  );
}
