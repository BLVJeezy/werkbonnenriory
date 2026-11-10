import type { InvoiceLine, ManualInvoiceLine } from "./invoice";

/** Pure: verkoopfactuurlijnen volgens de goedgekeurde offerte. Niet-gekozen opties vallen weg; btw = offertetarief. */
export function quoteInvoiceLines(lines: InvoiceLine[] | null | undefined, vatRate: number): ManualInvoiceLine[] {
  return (lines ?? [])
    .filter((l) => !l.optional && String(l.description ?? "").trim())
    .map((l) => {
      const x = l as InvoiceLine & { discount?: number; group?: string | null; hidePrice?: boolean };
      return {
        description: String(x.description).trim(), quantity: Number(x.quantity) || 0, unit: x.unit || "St",
        unitPrice: Number(x.unitPrice) || 0, vatRate: Number(vatRate) || 0,
        ...(x.discount ? { discount: Number(x.discount) } : {}),
        ...(x.group ? { group: x.group } : {}),
        ...(x.hidePrice ? { hidePrice: true } : {}),
      };
    });
}
