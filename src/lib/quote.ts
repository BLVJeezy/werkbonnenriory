import type { InvoiceLine } from "./invoice";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: totals for a quote from its lines and vat rate. Optional lines are excluded — they are customer choices, not part of the offer. */
export function quoteTotals(lines: InvoiceLine[], vatRate: number) {
  const net = r2(lines.filter((l) => !l.optional).reduce((s, l) => s + l.amount, 0));
  const vat = r2((net * vatRate) / 100);
  return { net, vat, total: r2(net + vat) };
}

/** Pure: totals of only the optional lines, shown separately so the customer sees what each option would add. */
export function quoteOptionsTotals(lines: InvoiceLine[], vatRate: number) {
  const net = r2(lines.filter((l) => l.optional).reduce((s, l) => s + l.amount, 0));
  const vat = r2((net * vatRate) / 100);
  return { net, vat, total: r2(net + vat) };
}

/** Pure: one quote line from description, quantity, unit and unit price. */
export function quoteLine(description: string, quantity: number, unit: string, unitPrice: number, discount = 0): InvoiceLine {
  const disc = Math.min(100, Math.max(0, Number(discount) || 0));
  const price = disc ? Math.round(unitPrice * (1 - disc / 100) * 1e6) / 1e6 : unitPrice;
  return { description, quantity, unit, unitPrice: price, amount: r2(quantity * price), ...(disc ? { discount: disc, originalUnitPrice: unitPrice } : {}) };
}

/** Pure: what a discounted line saves the customer (excl. btw); null without discount. */
export function lineDiscount(l: InvoiceLine): { percent: number; originalUnitPrice: number; originalAmount: number; saved: number } | null {
  if (!l.discount || l.originalUnitPrice == null) return null;
  const originalAmount = r2(l.quantity * l.originalUnitPrice);
  const saved = r2(originalAmount - l.amount);
  return saved > 0 ? { percent: l.discount, originalUnitPrice: l.originalUnitPrice, originalAmount, saved } : null;
}

/** Pure: customer-facing per-line figures: gross unit price, the discount, then the net unit price. */
export function discountLabel(l: InvoiceLine, money: (n: number) => string): string {
  const d = lineDiscount(l);
  if (!d) return "";
  return `Bruto ${money(d.originalUnitPrice)} · Korting ${d.percent.toLocaleString("nl-BE")}% - ${money(d.saved)} · Netto ${money(l.unitPrice)} per ${l.unit}`;
}

/** Pure: total discount over the offer (optional lines excluded) and the price before discount. */
export function quoteDiscountTotal(lines: InvoiceLine[]): { saved: number; beforeDiscount: number } {
  const main = lines.filter((l) => !l.optional);
  const saved = r2(main.reduce((s, l) => s + (lineDiscount(l)?.saved ?? 0), 0));
  return { saved, beforeDiscount: r2(main.reduce((s, l) => s + l.amount, 0) + saved) };
}

/** Quote status flow: concept -> verzonden -> akkoord (or geweigerd). */
export const QUOTE_STATUS: Record<string, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  akkoord: "Akkoord",
  geweigerd: "Geweigerd",
};
