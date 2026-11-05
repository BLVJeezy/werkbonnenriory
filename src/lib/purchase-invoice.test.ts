import { describe, expect, it } from "vitest";
import { fillMissingVatRates, lineTotals, normalizePurchaseInvoice, purchaseInvoiceWarnings, setPurchaseLineDiscount, purchaseDiscountTotals } from "./purchase-invoice";

describe("normalizePurchaseInvoice", () => {
  it("normaliseert het uitgelezen IBAN van de leverancier", () => {
    expect(normalizePurchaseInvoice({ supplierIban: " be68 5390 0754 7034 " }).supplierIban).toBe("BE68539007547034");
  });
  it("vult ontbrekende BIC uit de vaste IBAN-bankcodetabel", () => {
    expect(normalizePurchaseInvoice({ supplierIban: "BE71096123456769" }).supplierBic).toBe("GKCCBEBB");
  });
  it("behoudt de expliciet uitgelezen BIC", () => {
    expect(normalizePurchaseInvoice({ supplierIban: "BE68539007547034", supplierBic: "gkcc bebb xxx" }).supplierBic).toBe("GKCCBEBBXXX");
  });
  it("verzint geen bankgegevens bij ontbrekende brongegevens", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "Leverancier" });
    expect(inv.supplierIban).toBeNull();
    expect(inv.supplierBic).toBeNull();
  });
  it("leest korting zonder reeds afgeprijsde bedragen dubbel te verminderen", () => {
    const inv = normalizePurchaseInvoice({ lines: [{ quantity: 2, unitPrice: 50, net: 90, vatRate: 21, discountPercent: 10, discountAmount: 10 }], net: 90, vat: 18.9, total: 108.9 });
    expect(inv.lines[0]).toMatchObject({ amount: 90, discountPercent: 10, discountAmount: 10, discountBase: 100 });
    expect(inv.total).toBe(108.9);
  });
  it("leidt ontbrekend netto af na korting", () => {
    expect(normalizePurchaseInvoice({ lines: [{ quantity: 2, unitPrice: 50, discountPercent: 10, vatRate: 21 }] }).lines[0]).toMatchObject({ amount: 90, vat: 18.9, total: 108.9 });
  });
  it("behoudt expliciet nul netto bij volledige korting", () => {
    expect(normalizePurchaseInvoice({ lines: [{ quantity: 1, unitPrice: 100, net: 0, vat: 0, total: 0, discountPercent: 100 }] }).lines[0]).toMatchObject({ amount: 0, vat: 0, total: 0 });
  });
  it("vervangt een manuele korting en herrekent document en btw", () => {
    const line = { description: 'Buis', quantity: 2, unit: 'st', unitPrice: 50, amount: 100, vatRate: 21, vat: 21, total: 121 };
    const first = setPurchaseLineDiscount(line, 10, 'percent');
    const second = setPurchaseLineDiscount(first, 20, 'amount');
    expect(second.amount).toBe(80);
    expect(purchaseDiscountTotals([line], [second], { net: 100, vat: 21, total: 121 })).toEqual({ net: 80, vat: 16.8, total: 96.8 });
    expect(setPurchaseLineDiscount(second, 0, 'percent').amount).toBe(100);
    expect(() => setPurchaseLineDiscount(line, 101, 'percent')).toThrow();
  });
  it("berekent korting per btw-tarief", () => {
    const lines = [6, 21].map(vatRate => ({ description: 'Lijn', quantity: 1, unit: 'st', unitPrice: 100, amount: 100, vatRate }));
    expect(purchaseDiscountTotals(lines, lines.map(l => setPurchaseLineDiscount(l, 10, 'percent')), { net: 200, vat: 27, total: 227 })).toEqual({ net: 180, vat: 24.3, total: 204.3 });
  });
  it("normaliseert ruwe AI-output met komma-getallen", () => {
    const inv = normalizePurchaseInvoice({
      supplierName: "  Desco BV ", supplierVat: "BE0404123456", supplierIban: "BE71 0961 2345 6769",
      invoiceNumber: "2026-1042", invoiceDate: "2026-10-20", dueDate: "2026-11-03",
      lines: [{ description: "Kabel", quantity: "2", unit: "st", unitPrice: "12,50" }],
      net: "25,00", vat: "5,25", total: "30,25", paymentRef: "+++123/4567/89012+++",
    });
    expect(inv.supplierName).toBe("Desco BV");
    expect(inv.lines[0]).toEqual({ description: "Kabel", quantity: 2, unit: "st", unitPrice: 12.5, amount: 25, vatRate: null, vat: null, total: null });
    expect(inv.total).toBe(30.25);
  });

  it("leest per lijn tarief, ex btw, btw en incl btw", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "X", lines: [{ description: "Koffie", quantity: 2, unit: "st", unitPrice: 30, net: 60, vatRate: 21, vat: 12.6, total: 72.6 }] });
    expect(inv.lines[0]).toMatchObject({ amount: 60, vatRate: 21, vat: 12.6, total: 72.6 });
    expect(lineTotals(inv.lines[0]!)).toEqual({ net: 60, vat: 12.6, total: 72.6 });
  });

  it("rekent btw en incl uit een tarief", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "X", lines: [{ description: "Uren", quantity: 3, unit: "uur", unitPrice: 60, vatRate: "21%" }] });
    expect(inv.lines[0]).toMatchObject({ amount: 180, vatRate: 21, vat: 37.8, total: 217.8 });
  });

  it("rekent netto af uit een inclusief bedrag", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "X", lines: [{ description: "Broodjes", quantity: 1, unit: "st", total: 121, vatRate: 21 }] });
    expect(inv.lines[0]).toMatchObject({ amount: 100, vat: 21, total: 121 });
  });

  it("snapt het btw-tarief uit netto en btw", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "X", lines: [{ description: "Sloop", quantity: 1, net: 100, vat: 6 }] });
    expect(inv.lines[0]!.vatRate).toBe(6);
  });

  it("verzint geen btw als het document die niet toont", () => {
    const inv = normalizePurchaseInvoice({ supplierName: "X", lines: [{ description: "Kasticket", quantity: 1, amount: 12.1 }] });
    expect(inv.lines[0]).toMatchObject({ amount: 12.1, vatRate: null, vat: null, total: null });
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
  it("waarschuwt als de btw van de lijnen niet klopt met de btw op het document", () => {
    const withVat = normalizePurchaseInvoice({
      supplierName: "Desco", supplierIban: "BE71 0961 2345 6769", invoiceNumber: "1", dueDate: "2026-11-03",
      lines: [{ description: "Kabel", quantity: 1, net: 100, vat: 21 }], net: 100, vat: 12, total: 112,
    });
    expect(purchaseInvoiceWarnings(withVat).some((w) => w.includes("Btw van de lijnen"))).toBe(true);
  });
  it("waarschuwt bij ontbrekend IBAN en vervaldag", () => {
    const w = purchaseInvoiceWarnings({ ...ok, supplierIban: null, dueDate: null });
    expect(w.some((x) => x.includes("IBAN"))).toBe(true);
    expect(w.some((x) => x.includes("vervaldag"))).toBe(true);
  });
});

describe("fillMissingVatRates", () => {
  it("vult ontbrekende tarieven met het documenttarief", () => {
    const lines = fillMissingVatRates([
      { description: "A", quantity: 1, unit: "st", unitPrice: 100, amount: 100 },
      { description: "B", quantity: 1, unit: "st", unitPrice: 50, amount: 50, vatRate: 6 },
    ], 150, 31.5);
    expect(lines[0]!).toMatchObject({ vatRate: 21, vat: 21, total: 121 });
    expect(lines[1]!.vatRate).toBe(6);
  });
  it("valt terug op 21% als het document geen tarief verraadt", () => {
    const lines = fillMissingVatRates([{ description: "A", quantity: 1, unit: "st", unitPrice: 10, amount: 10 }], 0, 0);
    expect(lines[0]!.vatRate).toBe(21);
  });
});
