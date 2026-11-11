import type { ProductLine } from "./product-revenue";

export type SaleDocument = { id: string; number: string; issue_date: string; kind: string; lines: unknown };
export const invoiceIdentity = (number: string) => number.trim().toUpperCase();

/** Invoice snapshots are already net of discount; do not discount them twice. */
export function appProductLines(documents: SaleDocument[], from: string, to: string): ProductLine[] {
  const seen = new Set<string>();
  return documents.flatMap(doc => {
    const key = `app:${invoiceIdentity(doc.number) || doc.id}`;
    if (seen.has(key) || doc.issue_date < from || doc.issue_date > to) return [];
    seen.add(key);
    return (Array.isArray(doc.lines) ? doc.lines : []).flatMap((line: Record<string, unknown>) => {
      const quantity = Number(line["quantity"] ?? 0);
      const amount = Number(line["amount"] ?? quantity * Number(line["unitPrice"] ?? 0));
      if (!Number.isFinite(quantity) || !Number.isFinite(amount)) throw new Error(`Ongeldig bedrag op factuur ${doc.number}`);
      const credit = doc.kind === "creditnota";
      return [{ name: String(line["description"] ?? ""), quantity: credit ? -Math.abs(quantity) : quantity, amount: credit ? -Math.abs(amount) : amount, source: "app" as const, date: doc.issue_date, invoiceNumber: doc.number }];
    });
  });
}