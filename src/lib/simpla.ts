export type SimplaCustomer = { customerId?: number; customerName?: string; customerEmail?: string; customerEmailBilling?: string; isBlocked?: boolean };
const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
export function matchSimplaCustomer(rows: SimplaCustomer[], name: string, email: string | null) {
  const active = rows.filter((r) => !r.isBlocked);
  const byEmail = email ? active.filter((r) => [r.customerEmail, r.customerEmailBilling].some((v) => normalize(v) === normalize(email))) : [];
  const matches = byEmail.length ? byEmail : active.filter((r) => normalize(r.customerName) === normalize(name));
  return matches.length === 1 ? matches[0] : null;
}
export type SimplaBill = { billDatabaseId: number; billCustomerId?: number; billDate?: string | null; dueDate?: string | null; documentId?: string | null; paymentRef?: string | null; paymentDate?: string | null; amountPaid?: number | null; billTotalExVAT?: number; billTotalVAT?: number; billTotalIncVAT?: number };
export type SimplaBillLine = { billDatabaseId: number; billLineProductDescription?: string | null; billLineUnitPrice?: number; billLineNumber?: number; billLineDiscount?: number; productUnit?: string | null };
export type SimplaSupplier = { supplierId: number; supplierName?: string; supplierTAV?: string | null; supplierIBAN?: string | null };
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Pure: maps unpaid Simpla purchase bills to app purchase invoices; paid bills are skipped. */
export function mapSimplaPurchases(bills: SimplaBill[], lines: SimplaBillLine[], suppliers: SimplaSupplier[]) {
  const sup = new Map(suppliers.map((s) => [s.supplierId, s]));
  const byBill = new Map<number, SimplaBillLine[]>();
  for (const l of lines) byBill.set(l.billDatabaseId, [...(byBill.get(l.billDatabaseId) ?? []), l]);
  return bills.filter((b) => !b.paymentDate && !b.amountPaid).map((b) => {
    const s = b.billCustomerId != null ? sup.get(b.billCustomerId) : undefined;
    return {
      simpla_bill_id: b.billDatabaseId,
      supplier_name: s?.supplierName?.trim() || "Onbekende leverancier",
      supplier_vat: s?.supplierTAV?.trim() || null,
      supplier_iban: s?.supplierIBAN?.replace(/\s/g, "") || null,
      invoice_number: b.documentId?.trim() || null,
      invoice_date: day(b.billDate), due_date: day(b.dueDate),
      lines: (byBill.get(b.billDatabaseId) ?? []).map((l) => {
        const quantity = l.billLineNumber ?? 1, unitPrice = l.billLineUnitPrice ?? 0;
        return { description: l.billLineProductDescription ?? "", quantity, unit: l.productUnit || "st", unitPrice, amount: r2(quantity * unitPrice * (1 - (l.billLineDiscount ?? 0) / 100)) };
      }),
      net: r2(b.billTotalExVAT ?? 0), vat: r2(b.billTotalVAT ?? 0), total: r2(b.billTotalIncVAT ?? 0),
      payment_ref: b.paymentRef?.trim() || null,
      source: "simpla", status: "te_controleren",
    };
  });
}
