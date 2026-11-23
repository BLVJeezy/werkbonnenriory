import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchSelect } from "@/components/SearchSelect";
import { euro } from "@/lib/billing";
import {
  buildManualAllocationKey,
  sameLegalCustomer,
  unallocatedCustomerCredits,
  validateManualCreditAllocation,
  type CreditAllocationTarget,
  type CustomerIdentityLike,
} from "@/lib/credit-note-allocation";

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

type SimplaOpenInvoice = {
  id: string;
  number: string | null;
  counterparty: string | null;
  invoice_date: string | null;
  paid_amount: number | null;
  fin_invoice_lines: Array<{ ex_vat: number | null; vat: number | null }> | null;
};

/** Werklijst 'Te verrekenen klanttegoeden' in Boekhouding -> Bank (boekhoudkundig tegoed, geen fictieve bankverrichting). */
export function CustomerCreditsWorklist({ onChanged }: { onChanged?: () => void }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["customer-credits-worklist"],
    queryFn: async () => {
      const [wbRes, simplaRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, number, kind, total, paid_amount, credit_for, issue_date, customer")
          .order("issue_date", { ascending: false }),
        supabase
          .from("fin_invoices")
          .select("id, number, counterparty, invoice_date, paid_amount, fin_invoice_lines(ex_vat, vat)")
          .eq("source", "simpla")
          .eq("direction", "verkoop")
          .eq("doc_type", "factuur")
          .eq("status", "open")
          .order("invoice_date", { ascending: false }),
      ]);
      if (wbRes.error) throw wbRes.error;
      if (simplaRes.error) throw simplaRes.error;
      return {
        wbDocs: (wbRes.data ?? []) as unknown as SalesDoc[],
        simplaDocs: (simplaRes.data ?? []) as unknown as SimplaOpenInvoice[],
      };
    },
  });

  const allDocs = data?.wbDocs ?? [];
  const simplaDocs = data?.simplaDocs ?? [];
  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const credits = unallocatedCustomerCredits(allDocs);
  const totalOpenCredit = Math.round(credits.reduce((s, c) => s + c.openCredit, 0) * 100) / 100;

  const openTargets: CreditAllocationTarget[] = [
    ...allDocs
      .filter((d) => d.kind !== "creditnota" && Number(d.total) - Number(d.paid_amount ?? 0) > 0.005)
      .map((d): CreditAllocationTarget => ({
        id: `wb:${d.id}`,
        source: "werkbonnen",
        number: d.number,
        customer: d.customer,
        total: Number(d.total),
        paidAmount: Number(d.paid_amount ?? 0),
        openAmount: Math.round((Number(d.total) - Number(d.paid_amount ?? 0)) * 100) / 100,
        issueDate: d.issue_date,
      })),
    ...simplaDocs
      .map((s): CreditAllocationTarget => {
        const total = Math.round(
          Math.abs((s.fin_invoice_lines ?? []).reduce((sum, l) => sum + Number(l.ex_vat ?? 0) + Number(l.vat ?? 0), 0)) * 100,
        ) / 100;
        const paidAmount = Math.round(Number(s.paid_amount ?? 0) * 100) / 100;
        const openAmount = Math.round(Math.max(0, total - paidAmount) * 100) / 100;
        return {
          id: `simpla:${s.id}`,
          source: "simpla",
          number: s.number ?? "Zonder nummer",
          customer: s.counterparty ? { name: s.counterparty } : null,
          total,
          paidAmount,
          openAmount,
          issueDate: s.invoice_date,
        };
      })
      .filter((t) => t.openAmount > 0.005),
  ];
  const targetByKey = new Map(openTargets.map((t) => [t.id, t]));

  async function settle(credit: SalesDoc & { openCredit: number }) {
    const target = targetByKey.get(targetId);
    if (!target) { toast.error("Kies een openstaande factuur van dezelfde klant"); return; }
    const amt = Number(amount.replace(",", "."));
    const rawId = target.id.replace(/^(wb|simpla):/, "");
    const isOrigin = target.source === "werkbonnen" && rawId === credit.credit_for;
    const err = validateManualCreditAllocation({
      creditOpen: credit.openCredit,
      invoiceOpen: target.openAmount,
      requestedAmount: amt,
      creditCustomer: credit.customer,
      invoiceCustomer: target.customer,
      isOriginInvoice: isOrigin,
      targetSource: target.source,
    });
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const idempotencyKey = buildManualAllocationKey(credit.id, target.source, rawId, amt, date);
      if (target.source === "simpla") {
        const { error } = await supabase.rpc("settle_credit_note_to_fin_invoice", {
          p_credit: credit.id,
          p_fin_invoice: rawId,
          p_amount: amt,
          p_date: date,
          p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
        toast.success(`Klanttegoed van CN ${credit.number} (${euro(amt)}) lokaal verrekend met Simpla-factuur ${target.number}`);
      } else {
        const { error } = await supabase.rpc("settle_credit_note", {
          p_credit: credit.id,
          p_invoice: rawId,
          p_amount: amt,
          p_date: date,
          p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
        toast.success(`Klanttegoed van CN ${credit.number} (${euro(amt)}) verrekend met factuur ${target.number}`);
      }
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
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Boekhoudkundig klanttegoed uit verkoopcreditnota's (geen bankverrichting). Verreken manueel met een openstaande factuur uit Werkbonnenriory of een geïmporteerde Simpla-verkoopfactuur van dezelfde klant.
      </p>

      {credits.length === 0 ? (
        <p className="text-xs text-muted-foreground">Geen openstaande klanttegoeden.</p>
      ) : (
        <div className="space-y-2">
          {credits.map((c) => {
            const origin = c.credit_for ? byId.get(c.credit_for) : null;
            const isOpen = activeId === c.id;
            const sameCustomerTargets = openTargets.filter((t) => {
              const rawId = t.id.replace(/^(wb|simpla):/, "");
              return (t.source === "werkbonnen" && rawId === c.credit_for) || sameLegalCustomer(c.customer, t.customer);
            });
            const options = sameCustomerTargets.map((t) => {
              const rawId = t.id.replace(/^(wb|simpla):/, "");
              const srcTag = t.source === "simpla" ? "[Simpla]" : "[Werkbonnen]";
              const originTag = t.source === "werkbonnen" && rawId === c.credit_for ? " (oorsprong)" : "";
              return {
                value: t.id,
                label: `${srcTag} ${t.number} — ${t.customer?.name ?? ""} — open ${euro(t.openAmount)}${originTag}`,
                search: `${t.source} ${t.number} ${t.customer?.name ?? ""}`,
              };
            });
            const selectedTarget = targetByKey.get(targetId);
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
                    const first = sameCustomerTargets[0];
                    setTargetId(first?.id ?? "");
                    const firstOpen = first ? first.openAmount : c.openCredit;
                    setAmount(String(Math.round(Math.min(c.openCredit, firstOpen) * 100) / 100));
                  }}>
                    {isOpen ? "Sluiten" : "Tegoed verrekenen"}
                  </Button>
                </div>
                {isOpen && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {options.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Geen openstaande verkoopfactuur (Werkbonnenriory of geïmporteerde Simpla) voor dezelfde klant ({c.customer?.name ?? "onbekend"}). Controleer of de Simpla-factuur geïmporteerd is in Boekhouding.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[240px] flex-1 space-y-1">
                            <span className="text-xs text-muted-foreground">Openstaande factuur (Werkbonnenriory of Simpla, zelfde klant)</span>
                            <SearchSelect options={options} value={targetId} onChange={(val) => {
                              setTargetId(val);
                              const t = targetByKey.get(val);
                              if (t) {
                                setAmount(String(Math.round(Math.min(c.openCredit, t.openAmount) * 100) / 100));
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
                        {selectedTarget?.source === "simpla" && (
                          <p className="text-xs text-muted-foreground">
                            Lokale aflettering in Werkbonnenriory/Boekhouding tegen geïmporteerde Simpla-factuur {selectedTarget.number}. Dit wijzigt niets in Simpla zelf.
                          </p>
                        )}
                      </>
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