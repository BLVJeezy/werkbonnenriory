import type { ProductLine } from "./product-revenue";
import { invoiceIdentity } from "./product-sales";

export type SimplaSaleBill = { billDatabaseId: number; billId?: string | null; billDate?: string | null; billStatus?: string | null; isProformaInvoice?: boolean | null; credit?: boolean };
export type SimplaSaleLine = { billDatabaseId: number; billLineId?: number; billLineProductId?: number | null; billLineProductDescription?: string | null; billLineUnitPrice?: number | null; billLineNumber?: number | null; billLineDiscount?: number | null };

/**
 * Pure: Simpla-verkooplijnen binnen [from, to] als productregels, alleen vóór `before`
 * (eerste werkdag die de app zelf telt), zodat niets dubbel meetelt. Concepten en pro-forma's tellen niet;
 * korting is een percentage; creditnota's behouden hun negatieve bedragen.
 */
export function simplaProductLines(bills: SimplaSaleBill[], lines: SimplaSaleLine[], from: string, to: string, before: string | null, appNumbers: string[] = []): ProductLine[] {
  const days = new Map<number, { date: string; number: string; credit: boolean }>();
  const seen = new Set<string>();
  const inApp = new Set(appNumbers.map(invoiceIdentity));
  for (const b of bills) {
    const d = (b.billDate ?? "").slice(0, 10);
    if (!d || b.billStatus === "DRAFT" || b.isProformaInvoice) continue;
    if (d < from || d > to || (before && d >= before)) continue;
    const number = b.billId ?? String(b.billDatabaseId);
    const key = invoiceIdentity(number);
    if (seen.has(key) || (b.billId && inApp.has(key))) continue;
    seen.add(key);
    days.set(b.billDatabaseId, { date: d, number, credit: !!b.credit });
  }
  const out: ProductLine[] = [];
  const seenLines = new Set<number>();
  for (const l of lines) {
    const doc = days.get(l.billDatabaseId);
    if (!doc || (l.billLineId != null && seenLines.has(l.billLineId))) continue;
    if (l.billLineId != null) seenLines.add(l.billLineId);
    const q = Number(l.billLineNumber ?? 0);
    const amount = q * Number(l.billLineUnitPrice ?? 0) * (1 - Number(l.billLineDiscount ?? 0) / 100);
    if (!Number.isFinite(q) || !Number.isFinite(amount)) throw new Error(`Ongeldige Simpla-regel op factuur ${doc.number}`);
    out.push({ name: String(l.billLineProductDescription ?? ""), quantity: doc.credit ? -Math.abs(q) : q, amount: doc.credit ? -Math.abs(amount) : amount, source: "simpla", date: doc.date, invoiceNumber: doc.number, ...(l.billLineProductId != null ? { sourceProductId: String(l.billLineProductId) } : {}) });
  }
  return out;
}
