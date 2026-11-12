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

/** Quote status flow: concept -> verzonden -> akkoord (or geweigerd). */
export const QUOTE_STATUS: Record<string, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  akkoord: "Akkoord",
  geweigerd: "Geweigerd",
};
