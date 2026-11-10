import { describe, expect, it } from "vitest";
import { quoteInvoiceLines } from "./subcontract";

describe("quoteInvoiceLines", () => {
  it("neemt de offertelijnen over met het offertetarief", () => {
    const r = quoteInvoiceLines([{ description: "Dieptereiniging regenwaterput", quantity: 1, unit: "St", unitPrice: 369.45, amount: 369.45 }], 6);
    expect(r).toEqual([{ description: "Dieptereiniging regenwaterput", quantity: 1, unit: "St", unitPrice: 369.45, vatRate: 6 }]);
  });
  it("laat niet-gekozen opties weg", () => {
    const r = quoteInvoiceLines([
      { description: "Reiniging", quantity: 1, unit: "St", unitPrice: 100, amount: 100 },
      { description: "Camera-inspectie", quantity: 1, unit: "St", unitPrice: 95, amount: 95, optional: true },
    ], 21);
    expect(r.map((l) => l.description)).toEqual(["Reiniging"]);
  });
});
