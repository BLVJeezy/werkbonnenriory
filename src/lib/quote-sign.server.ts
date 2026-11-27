import type { InvoiceLine, InvoiceCustomer } from "@/lib/invoice";
import { quoteTotals } from "@/lib/quote";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Signing a quote, shared by the public signing page (by token) and the customer portal (by id),
 * so both create the same contract, totals and status.
 */
export async function signQuoteRecord(
  db: Db,
  match: { column: "token" | "id"; value: string },
  data: { signature: string; name: string; options: number[] },
) {
    const { data: q } = await db.from("quotes").select("id, number, kind, status, lines, vat_rate, customer_id, customer, intro, technician_id, contract_id, contract_repeat_every, contract_repeat_unit, contract_start_date, contract_end_date").eq(match.column, match.value).maybeSingle();
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status === "akkoord") return { ok: true as const };
    // The customer picks optional lines by clicking; chosen options become part of the offer and its total.
    const lines = (q.lines as InvoiceLine[]).map((l, i) =>
      l.optional && data.options.includes(i) ? { ...l, optional: false } : l,
    );
    const t = quoteTotals(lines, Number(q.vat_rate));
    let contractId = q.contract_id as string | null;
    if (q.kind === "contract" && !contractId) {
      const { nextContractNumber } = await import("@/lib/contract-pdf");
      const { data: existingNums } = await db.from("contracts").select("number");
      const contractNumber = nextContractNumber((existingNums ?? []).map((x: { number: string | null }) => x.number));
      const billingLines = lines.filter((l) => !l.optional && l.description.trim().length > 0).map((l) => ({
        description: l.description,
        quantity: Number(l.quantity) || 1,
        unit: l.unit || "st",
        unitPrice: Number(l.originalUnitPrice ?? l.unitPrice) || 0,
        discount: Number(l.discount) || 0,
        vatRate: ([0, 6, 12, 21].includes(Number(l.vatRate ?? q.vat_rate)) ? Number(l.vatRate ?? q.vat_rate) : 21) as 0 | 6 | 12 | 21,
      }));
      const cust = (q.customer ?? {}) as InvoiceCustomer;
      const unit = ["week", "maand", "jaar"].includes(q.contract_repeat_unit ?? "") ? q.contract_repeat_unit : "maand";
      const every = Math.max(1, Number(q.contract_repeat_every) || 6);
      const nextDate = q.contract_start_date || new Date().toISOString().slice(0, 10);
      const { data: created, error: ce } = await db.from("contracts").insert({
        number: contractNumber,
        name: q.intro?.trim() || billingLines[0]?.description || `Onderhoudscontract ${q.number}`,
        customer_id: q.customer_id,
        customer_name: cust.name,
        description: [q.intro?.trim(), ...billingLines.map((l) => `${l.quantity} ${l.unit} ${l.description}`)].filter(Boolean).join("\n"),
        repeat_every: every,
        repeat_unit: unit,
        invoice_every: every,
        invoice_unit: unit,
        invoice_amount: t.net,
        next_date: nextDate,
        end_date: q.contract_end_date ?? null,
        technician_id: q.technician_id,
        active: true,
        scheduling_ready: true,
        billing_enabled: billingLines.length > 0,
        billing_enabled_at: billingLines.length > 0 ? new Date().toISOString() : null,
        billing_lines: billingLines,
      }).select("id").single();
      if (ce) throw new Error(ce.message);
      contractId = created.id;
    }
    const { error } = await db.from("quotes").update({
      status: "akkoord", signature: data.signature, signed_name: data.name, signed_at: new Date().toISOString(),
      lines, net: t.net, vat: t.vat, total: t.total, contract_id: contractId,
    }).eq("id", q.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
}
