export interface SimplaCreditNoteDraft {
  direction: "verkoop" | "aankoop";
  doc_type: "creditnota";
  source: "simpla";
  source_ref: string;
  number: string;
  counterparty: string;
  invoice_date: string | null;
  due_date: string | null;
  status: "open" | "betaald";
  review_status: "goedgekeurd";
  paid_amount: number;
  lines: { account: string; description: string; ex_vat: number; vat: number; vat_rate: number | null }[];
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const cleanDate = (v: unknown): string | null => {
  const s = String(v ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== "0000-00-00" ? s : null;
};

export function mapSimplaSalesCreditNotes(
  notes: Record<string, unknown>[],
  lines: Record<string, unknown>[],
  customers: Record<string, unknown>[],
  existingRefs: Set<string>,
): SimplaCreditNoteDraft[] {
  const custName = new Map<string, string>();
  for (const c of customers) {
    const id = String(c["customerDatabaseId"] ?? c["id"] ?? "");
    if (!id) continue;
    const name = String(c["customerName"] ?? c["customerCompany"] ?? c["name"] ?? "").trim();
    if (name) custName.set(id, name);
  }
  const byNote = new Map<string, Record<string, unknown>[]>();
  for (const l of lines) {
    const cid = String(l["creditnoteDatabaseId"] ?? "");
    if (!cid) continue;
    const arr = byNote.get(cid) ?? [];
    arr.push(l);
    byNote.set(cid, arr);
  }
  const out: SimplaCreditNoteDraft[] = [];
  for (const n of notes) {
    const id = String(n["creditnoteDatabaseId"] ?? "").trim();
    if (!id) continue;
    const ref = `cn-${id}`;
    if (existingRefs.has(ref)) continue;
    const state = String(n["creditnoteState"] ?? "").toUpperCase();
    if (state === "DRAFT" || state === "DELETED") continue;
    const invDate = cleanDate(n["creditnoteDate"]);
    const dueDate = cleanDate(n["creditnoteExpiryDate"]);
    const safeDue = dueDate && invDate && dueDate < invDate ? invDate : dueDate;
    const num = String(n["creditnoteNumber"] ?? id).trim();
    const counterparty = custName.get(String(n["customerDatabaseId"] ?? "")) ?? String(n["customerName"] ?? "Onbekende klant").trim();
    const rawLines = byNote.get(id) ?? [];
    const mappedLines = rawLines
      .map((l) => {
        const ex = r2(Math.abs(Number(l["creditnotelineTotalExVAT"] ?? l["creditnotelinePriceExVAT"] ?? 0)));
        const inc = r2(Math.abs(Number(l["creditnotelineTotalIncVAT"] ?? 0)));
        const rate = l["creditnotelineVATPercentage"] != null ? Number(l["creditnotelineVATPercentage"]) : null;
        const vat = inc > 0 ? r2(Math.max(0, inc - ex)) : rate != null ? r2(ex * (rate / 100)) : 0;
        return {
          account: "700000",
          description: String(l["creditnotelineDescription"] ?? `Creditnota ${num}`).trim() || `Creditnota ${num}`,
          ex_vat: ex,
          vat,
          vat_rate: rate,
        };
      })
      .filter((l) => l.ex_vat > 0 || l.vat > 0);
    if (!mappedLines.length) {
      const ex = r2(Math.abs(Number(n["creditnoteTotalExVAT"] ?? 0)));
      const inc = r2(Math.abs(Number(n["creditnoteTotalIncVAT"] ?? 0)));
      const vat = r2(Math.max(0, inc - ex));
      if (ex <= 0 && vat <= 0) continue;
      mappedLines.push({ account: "700000", description: `Creditnota ${num}`, ex_vat: ex, vat, vat_rate: ex > 0 ? Math.round((vat / ex) * 100) : null });
    }
    const total = r2(mappedLines.reduce((s, l) => s + l.ex_vat + l.vat, 0));
    const paid = state === "PAID";
    out.push({
      direction: "verkoop",
      doc_type: "creditnota",
      source: "simpla",
      source_ref: ref,
      number: num,
      counterparty,
      invoice_date: invDate,
      due_date: safeDue,
      status: paid ? "betaald" : "open",
      review_status: "goedgekeurd",
      paid_amount: paid ? total : 0,
      lines: mappedLines,
    });
  }
  return out;
}

export function mapSimplaPurchaseCreditNotes(
  bills: Record<string, unknown>[],
  suppliers: Record<string, unknown>[],
  existingRefs: Set<string>,
): SimplaCreditNoteDraft[] {
  const supName = new Map<string, string>();
  for (const s of suppliers) {
    const id = String(s["supplierDatabaseId"] ?? s["id"] ?? "");
    if (!id) continue;
    const name = String(s["supplierName"] ?? s["name"] ?? "").trim();
    if (name) supName.set(id, name);
  }
  const out: SimplaCreditNoteDraft[] = [];
  for (const b of bills) {
    const id = String(b["billDatabaseId"] ?? "").trim();
    if (!id || existingRefs.has(id)) continue;
    const rawEx = Number(b["billTotalExVAT"] ?? 0);
    const rawInc = Number(b["billTotalIncVAT"] ?? 0);
    if (rawEx >= 0 && rawInc >= 0) continue;
    const ex = r2(Math.abs(rawEx));
    const inc = r2(Math.abs(rawInc));
    const vat = r2(Math.max(0, inc - ex));
    if (ex <= 0 && vat <= 0) continue;
    const invDate = cleanDate(b["billDate"]);
    const dueDate = cleanDate(b["billExpiryDate"]);
    const safeDue = dueDate && invDate && dueDate < invDate ? invDate : dueDate;
    const num = String(b["billNumber"] ?? id).trim();
    const counterparty = supName.get(String(b["supplierDatabaseId"] ?? "")) ?? String(b["supplierName"] ?? "Onbekende leverancier").trim();
    const paid = String(b["billState"] ?? "").toUpperCase() === "PAID";
    out.push({
      direction: "aankoop",
      doc_type: "creditnota",
      source: "simpla",
      source_ref: id,
      number: num,
      counterparty,
      invoice_date: invDate,
      due_date: safeDue,
      status: paid ? "betaald" : "open",
      review_status: "goedgekeurd",
      paid_amount: paid ? r2(ex + vat) : 0,
      lines: [{ account: "604000", description: `Creditnota ${num}`, ex_vat: ex, vat, vat_rate: ex > 0 ? Math.round((vat / ex) * 100) : null }],
    });
  }
  return out;
}