import type { ProductLine } from "./product-revenue";

export type SimplaSaleBill = { billDatabaseId: number; billDate?: string | null; billStatus?: string | null; isProformaInvoice?: boolean | null };
export type SimplaSaleLine = { billDatabaseId: number; billLineProductDescription?: string | null; billLineUnitPrice?: number | null; billLineNumber?: number | null; billLineDiscount?: number | null };

/**
 * Pure: Simpla-verkooplijnen binnen [from, to] als productregels, alleen vóór `before`
 * (eerste werkdag die de app zelf telt), zodat niets dubbel meetelt. Concepten en pro-forma's tellen niet;
 * korting is een percentage; creditnota's behouden hun negatieve bedragen.
 */
export function simplaProductLines(bills: SimplaSaleBill[], lines: SimplaSaleLine[], from: string, to: string, before: string | null): ProductLine[] {
  const days = new Map<number, string>();
  for (const b of bills) {
    const d = (b.billDate ?? "").slice(0, 10);
    if (!d || b.billStatus === "DRAFT" || b.isProformaInvoice) continue;
    if (d < from || d > to || (before && d >= before)) continue;
    days.set(b.billDatabaseId, d);
  }
  const out: ProductLine[] = [];
  for (const l of lines) {
    if (!days.has(l.billDatabaseId)) continue;
    const q = Number(l.billLineNumber ?? 0);
    const amount = q * Number(l.billLineUnitPrice ?? 0) * (1 - Number(l.billLineDiscount ?? 0) / 100);
    out.push({ name: String(l.billLineProductDescription ?? ""), quantity: q, amount });
  }
  return out;
}
