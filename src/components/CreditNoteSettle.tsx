import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/SearchSelect";
import { euro } from "@/lib/billing";
import {
  buildManualAllocationKey,
  sameLegalCustomer,
  validateManualCreditAllocation,
  type CreditAllocationTarget,
  type CustomerIdentityLike,
} from "@/lib/credit-note-allocation";

type Inv = { id: string; number: string; kind: string; total: number; paid_amount: number; credit_for: string | null; customer: unknown };
type SimplaRow = {
  id: string;
  number: string | null;
  counterparty: string | null;
  invoice_date: string | null;
  paid_amount: number | null;
  fin_invoice_lines: Array<{ ex_vat: number | null; vat: number | null }> | null;
};

/** Creditnota verrekenen met een open Werkbonnenriory- of geïmporteerde Simpla-factuur, of een manuele terugbetaling boeken. */
export function CreditNoteSettle({ credit, invoices, onDone }: { credit: Inv; invoices: Inv[]; onDone: () => void }) {
  const openAmount = Math.round((Math.abs(Number(credit.total)) - Math.abs(Number(credit.paid_amount))) * 100) / 100;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"offset" | "refund">("offset");

  const { data: simplaRows = [] } = useQuery({
    queryKey: ["simpla-open-sales-invoices"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fin_invoices")
        .select("id, number, counterparty, invoice_date, paid_amount, fin_invoice_lines(ex_vat, vat)")
        .eq("source", "simpla")
        .eq("direction", "verkoop")
        .eq("doc_type", "factuur")
        .eq("status", "open")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SimplaRow[];
    },
  });

  const wbTargets: CreditAllocationTarget[] = invoices
    .filter((i) =>
      i.kind !== "creditnota" &&
      Number(i.total) - Number(i.paid_amount) > 0.005 &&
      (i.id === credit.credit_for || sameLegalCustomer(credit.customer as CustomerIdentityLike, i.customer as CustomerIdentityLike)),
    )
    .map((i) => ({
      id: `wb:${i.id}`,
      source: "werkbonnen",
      number: i.number,
      customer: i.customer as CustomerIdentityLike | null,
      total: Number(i.total),
      paidAmount: Number(i.paid_amount),
      openAmount: Math.round((Number(i.total) - Number(i.paid_amount)) * 100) / 100,
      issueDate: null,
      isOrigin: i.id === credit.credit_for,
    }));

  const simplaTargets: CreditAllocationTarget[] = simplaRows
    .map((s): CreditAllocationTarget => {
      const total = Math.round(
        Math.abs((s.fin_invoice_lines ?? []).reduce((sum, l) => sum + Number(l.ex_vat ?? 0) + Number(l.vat ?? 0), 0)) * 100,
      ) / 100;
      const paidAmount = Math.round(Number(s.paid_amount ?? 0) * 100) / 100;
      const openAmt = Math.round(Math.max(0, total - paidAmount) * 100) / 100;
      return {
        id: `simpla:${s.id}`,
        source: "simpla",
        number: s.number ?? "Zonder nummer",
        customer: s.counterparty ? { name: s.counterparty } : null,
        total,
        paidAmount,
        openAmount: openAmt,
        issueDate: s.invoice_date,
      };
    })
    .filter((t) => t.openAmount > 0.005 && sameLegalCustomer(credit.customer as CustomerIdentityLike, t.customer));

  const allTargets = [...wbTargets, ...simplaTargets];
  const defaultTarget = wbTargets.find((t) => t.isOrigin)?.id ?? "";
  const [invoiceId, setInvoiceId] = useState(defaultTarget);
  const [amount, setAmount] = useState(String(openAmount));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  if (openAmount <= 0.005) return null;
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Verrekenen / terugbetalen</Button>;

  const selectedTarget = allTargets.find((t) => t.id === invoiceId);
  const options = allTargets.map((t) => ({
    value: t.id,
    label: `${t.source === "simpla" ? "[Simpla]" : "[Werkbonnen]"} ${t.number} — ${t.customer?.name ?? ""} — open ${euro(t.openAmount)}${t.isOrigin ? " (oorspronkelijke factuur)" : ""}`,
    search: `${t.source} ${t.number} ${t.customer?.name ?? ""}`,
  }));

  async function save() {
    const amt = Number(amount.replace(",", "."));
    if (!(amt > 0)) { toast.error("Vul een bedrag in"); return; }
    if (mode === "offset" && !invoiceId) { toast.error("Kies een factuur"); return; }
    if (mode === "offset") {
      if (!selectedTarget) { toast.error("Kies een geldige openstaande factuur"); return; }
      const err = validateManualCreditAllocation({
        creditOpen: openAmount,
        invoiceOpen: selectedTarget.openAmount,
        requestedAmount: amt,
        creditCustomer: credit.customer as CustomerIdentityLike,
        invoiceCustomer: selectedTarget.customer,
        isOriginInvoice: Boolean(selectedTarget.isOrigin),
        targetSource: selectedTarget.source,
      });
      if (err) { toast.error(err); return; }
    }
    setBusy(true);
    let error: { message: string } | null = null;
    if (mode === "offset" && selectedTarget?.source === "simpla") {
      const rawId = selectedTarget.id.replace(/^simpla:/, "");
      const res = await supabase.rpc("settle_credit_note_to_fin_invoice", {
        p_credit: credit.id,
        p_fin_invoice: rawId,
        p_amount: amt,
        p_date: date,
        p_idempotency_key: buildManualAllocationKey(credit.id, "simpla", rawId, amt, date),
      });
      error = res.error;
    } else {
      const rawId = mode === "offset" ? invoiceId.replace(/^wb:/, "") : null;
      const res = await supabase.rpc("settle_credit_note", {
        p_credit: credit.id,
        p_invoice: rawId as unknown as string,
        p_amount: amt,
        p_date: date,
        ...(rawId ? { p_idempotency_key: buildManualAllocationKey(credit.id, "werkbonnen", rawId, amt, date) } : {}),
      });
      error = res.error;
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      mode === "offset"
        ? selectedTarget?.source === "simpla"
          ? `Creditnota lokaal verrekend met Simpla-factuur ${selectedTarget.number}`
          : "Creditnota verrekend met de factuur"
        : "Terugbetaling geboekt",
    );
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
          <Label>Factuur die met deze creditnota wordt afgeboekt (Werkbonnenriory of Simpla)</Label>
          {options.length ? (
            <SearchSelect
              options={options}
              value={invoiceId}
              onChange={(val) => {
                setInvoiceId(val);
                const t = allTargets.find((item) => item.id === val);
                if (t) setAmount(String(Math.round(Math.min(openAmount, t.openAmount) * 100) / 100));
              }}
              placeholder="Kies factuur…"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Er zijn geen openstaande facturen (Werkbonnenriory of geïmporteerde Simpla) voor deze klant.</p>
          )}
          {selectedTarget?.source === "simpla" && (
            <p className="text-xs text-muted-foreground">
              Lokale aflettering in Werkbonnenriory/Boekhouding — dit wijzigt niets in Simpla zelf.
            </p>
          )}
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
