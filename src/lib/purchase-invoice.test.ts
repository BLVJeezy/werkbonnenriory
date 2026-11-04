import { describe, expect, it } from "vitest";
import { normalizePurchaseInvoice, purchaseInvoiceWarnings } from "./purchase-invoice";

describe("normalizePurchaseInvoice", () => {
  it("normaliseert ruwe AI-output met komma-getallen", () => {
    const inv = normalizePurchaseInvoice({
      supplierName: "  Desco BV ", supplierVat: "BE0404123456", supplierIban: "BE71 0961 2345 6769",
      invoiceNumber: "2026-1042", invoiceDate: "2026-10-20", dueDate: "2026-11-03",
      lines: [{ description: "Kabel", quantity: "2", unit: "st", unitPrice: "12,50" }],
      net: "25,00", vat: "5,25", total: "30,25", paymentRef: "+++123/4567/89012+++",
    });
    expect(inv.supplierName).toBe("Desco BV");
    expect(inv.lines[0]).toEqual({ description: "Kabel", quantity: 2, unit: "st", unitPrice: 12.5, amount: 25 });
    expect(inv.total).toBe(30.25);
  });

  it("rekent netto af uit lijnen als het ontbreekt", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "X", lines: [{ description: "a", quantity: 2, unitPrice: 10 }], total: 0, vat: 0 });
    expect(inv.net).toBe(20);
    expect(inv.total).toBe(20);
  });

  it("weigert kapotte datums en lege leverancier", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "", invoiceDate: "20/10/2026", dueDate: "morgen" });
    expect(inv.supplierName).toBe("Onbekend");
    expect(inv.invoiceDate).toBeNull();
    expect(inv.dueDate).toBeNull();
  });

  it("schrijft een BIC in hoofdletters zonder spaties", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "X", supplierBic: " gkcc bebB ", lines: [], net: 0, vat: 0, total: 0 });
    expect(inv.supplierBic).toBe("GKCCBEBB");
    expect(normalizePurchaseInvoice({ supplierName: "X", supplierBic: "   " }).supplierBic).toBeNull();
  });
});

describe("purchaseInvoiceWarnings", () => {
  const ok = normalizePurchaseInvoice({
    supplierName: "Desco", supplierIban: "BE71 0961 2345 6769", invoiceNumber: "1",
    dueDate: "2026-11-03", lines: [{ description: "Kabel", quantity: 1, unitPrice: 100 }], net: 100, vat: 21, total: 121,
  });
  it("geeft geen waarschuwingen bij een consistente factuur", () => {
    expect(purchaseInvoiceWarnings(ok)).toEqual([]);
  });
  it("waarschuwt als lijnen niet kloppen met netto", () => {
    expect(purchaseInvoiceWarnings({ ...ok, net: 90 }).some((w) => w.includes("wijkt af"))).toBe(true);
  });
  it("waarschuwt bij ontbrekend IBAN en vervaldag", () => {
    const w = purchaseInvoiceWarnings({ ...ok, supplierIban: null, dueDate: null });
    expect(w.some((x) => x.includes("IBAN"))).toBe(true);
    expect(w.some((x) => x.includes("vervaldag"))).toBe(true);
  });
});
