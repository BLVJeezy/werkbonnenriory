import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchSelect } from "@/components/SearchSelect";
import { euro } from "@/lib/billing";
import { sameLegalCustomer, unallocatedCustomerCredits, validateManualCreditAllocation, type CustomerIdentityLike } from "@/lib/credit-note-allocation";

type SalesDoc = {
  id: string;
  number: string;
  kind: string;
  total: number;
  paid_amount: number;
  credit_for: string | null;
  issue_date: string;
  customer: CustomerIdentityLike | null;
};

type BackfillItem = {
  credit_id: string;
  credit_number: string;
  origin_number: string;
  customer_name: string | null;
  would_allocate: number;
  surplus_credit: number;
};

/** Werklijst 'Te verrekenen klanttegoeden' in Boekhouding -> Bank (boekhoudkundig tegoed, geen fictieve bankverrichting). */
export function CustomerCreditsWorklist({ onChanged }: { onChanged?: () => void }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState<{ count: number; items: BackfillItem[] } | null>(null);

  const { data } = useQuery({
    queryKey: ["customer-credits-worklist"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("invoices")
        .select("id, number, kind, total, paid_amount, credit_for, issue_date, customer")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as unknown as SalesDoc[];
    },
  });

  const allDocs = data ?? [];
  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const credits = unallocatedCustomerCredits(allDocs);
  const totalOpenCredit = Math.round(credits.reduce((s, c) => s + c.openCredit, 0) * 100) / 100;
  const openSalesInvoices = allDocs.filter((d) => d.kind !== "creditnota" && Number(d.total) - Number(d.paid_amount ?? 0) > 0.005);

  async function runDryRun() {
    setBusy(true);
    try {
      const { data: res, error } = await supabase.rpc("backfill_credit_note_allocations", { p_dry_run: true });
      if (error) throw error;
      const parsed = res as unknown as { count: number; items: BackfillItem[] };
      setDryRun(parsed);
      if (parsed.count === 0) toast.info("Alle historische creditnota's met oorsprongsfactuur zijn al verrekend.");
    } catch (e: any) {
      toast.error(e.message || "Controle mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function applyBackfill() {
    if (!confirm("Historische creditnota's automatisch verrekenen tegen het openstaand saldo van hun oorsprongsfactuur?")) return;
    setBusy(true);
    try {
      const { data: res, error } = await supabase.rpc("backfill_credit_note_allocations", { p_dry_run: false });
      if (error) throw error;
      const parsed = res as unknown as { count: number };
      toast.success(`${parsed.count} historische creditnota('s) verwerkt`);
      setDryRun(null);
      qc.invalidateQueries({ queryKey: ["customer-credits-worklist"] });
      qc.invalidateQueries({ queryKey: ["facturen"] });
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Verwerking mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function settle(credit: SalesDoc & { openCredit: number }) {
    const target = byId.get(targetId);
    if (!target) { toast.error("Kies een openstaande factuur van dezelfde klant"); return; }
    const amt = Number(amount.replace(",", "."));
    const invOpen = Math.round((Number(target.total) - Number(target.paid_amount ?? 0)) * 100) / 100;
    const err = validateManualCreditAllocation({
      creditOpen: credit.openCredit,
      invoiceOpen: invOpen,
      requestedAmount: amt,
      creditCustomer: credit.customer,
      invoiceCustomer: target.customer,
      isOriginInvoice: target.id === credit.credit_for,
    });
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("settle_credit_note", {
        p_credit: credit.id,
        p_invoice: target.id,
        p_amount: amt,
        p_date: date,
      });
      if (error) throw error;
      toast.success(`Klanttegoed van CN ${credit.number} (${euro(amt)}) verrekend met factuur ${target.number}`);
      setActiveId(null);
      setTargetId("");
      qc.invalidateQueries({ queryKey: ["customer-credits-worklist"] });
      qc.invalidateQueries({ queryKey: ["facturen"] });
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Verrekenen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Te verrekenen klanttegoeden ({credits.length})</h3>
          {credits.length > 0 && (
            <Badge variant="outline" className="border-primary/40 bg-primary/10 font-mono text-xs">
              Open: {euro(totalOpenCredit)}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={runDryRun}>
          Historische creditnota's controleren
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Boekhoudkundig klanttegoed uit verkoopcreditnota's (geen bankverrichting). Verreken met een openstaande factuur van dezelfde klant, of boek een echte uitgaande bankbetaling af bij terugbetaling.
      </p>

      {dryRun && dryRun.count > 0 && (
        <div className="mb-3 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <div className="font-semibold">Voorbeeldcontrole: {dryRun.count} creditnota('s) met oorsprongsfactuur gevonden</div>
          <div className="space-y-1">
            {dryRun.items.map((it) => (
              <div key={it.credit_id} className="flex flex-wrap justify-between gap-2">
                <span>CN <span className="font-mono font-semibold">{it.credit_number}</span> → Factuur <span className="font-mono font-semibold">{it.origin_number}</span> ({it.customer_name ?? "Klant"})</span>
                <span className="font-mono">Verrekenen: {euro(it.would_allocate)}{it.surplus_credit > 0.005 ? ` · Resttegoed: ${euro(it.surplus_credit)}` : ""}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={applyBackfill}>Nu verrekenen</Button>
            <Button size="sm" variant="ghost" onClick={() => setDryRun(null)}>Sluiten</Button>
          </div>
        </div>
      )}

      {credits.length === 0 ? (
        <p className="text-xs text-muted-foreground">Geen openstaande klanttegoeden.</p>
      ) : (
        <div className="space-y-2">
          {credits.map((c) => {
            const origin = c.credit_for ? byId.get(c.credit_for) : null;
            const isOpen = activeId === c.id;
            const sameCustomerInvoices = openSalesInvoices.filter((inv) => inv.id === c.credit_for || sameLegalCustomer(c.customer, inv.customer));
            const options = sameCustomerInvoices.map((inv) => {
              const openAmt = Math.round((Number(inv.total) - Number(inv.paid_amount ?? 0)) * 100) / 100;
              return {
                value: inv.id,
                label: `${inv.number} — ${inv.customer?.name ?? ""} — open ${euro(openAmt)}${inv.id === c.credit_for ? " (oorsprong)" : ""}`,
                search: `${inv.number} ${inv.customer?.name ?? ""}`,
              };
            });
            return (
              <div key={c.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">CN {c.number}</span>
                      <span className="font-medium">{c.customer?.name ?? "Onbekende klant"}</span>
                      {origin && <span className="text-xs text-muted-foreground">Oorsprong: factuur {origin.number}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Datum {c.issue_date} · Totaal {euro(Math.abs(Number(c.total)))} · Al verrekend {euro(Math.abs(Number(c.paid_amount ?? 0)))} · <span className="font-semibold text-foreground">Tegoed open: {euro(c.openCredit)}</span>
                    </div>
                  </div>
                  <Button size="sm" variant={isOpen ? "secondary" : "outline"} onClick={() => {
                    if (isOpen) { setActiveId(null); return; }
                    setActiveId(c.id);
                    const first = sameCustomerInvoices[0];
                    setTargetId(first?.id ?? "");
                    const firstOpen = first ? Math.round((Number(first.total) - Number(first.paid_amount ?? 0)) * 100) / 100 : c.openCredit;
                    setAmount(String(Math.round(Math.min(c.openCredit, firstOpen) * 100) / 100));
                  }}>
                    {isOpen ? "Sluiten" : "Tegoed verrekenen"}
                  </Button>
                </div>
                {isOpen && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {options.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Geen openstaande verkoopfactuur voor dezelfde klant ({c.customer?.name ?? "onbekend"}). Dit tegoed blijft open tot een nieuwe factuur of een echte terugbetaling via de bank.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[240px] flex-1 space-y-1">
                          <span className="text-xs text-muted-foreground">Openstaande factuur (zelfde klant)</span>
                          <SearchSelect options={options} value={targetId} onChange={(val) => {
                            setTargetId(val);
                            const inv = byId.get(val);
                            if (inv) {
                              const invOpen = Math.round((Number(inv.total) - Number(inv.paid_amount ?? 0)) * 100) / 100;
                              setAmount(String(Math.round(Math.min(c.openCredit, invOpen) * 100) / 100));
                            }
                          }} placeholder="Kies factuur…" />
                        </div>
                        <div className="w-28 space-y-1">
                          <span className="text-xs text-muted-foreground">Bedrag (€)</span>
                          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                        </div>
                        <div className="w-36 space-y-1">
                          <span className="text-xs text-muted-foreground">Datum</span>
                          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                        <Button size="sm" disabled={busy || !targetId} onClick={() => settle(c)}>
                          {busy ? "Bezig…" : "Verrekenen"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}