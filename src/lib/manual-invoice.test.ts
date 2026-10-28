import { describe, expect, it } from "vitest";
import { buildManualInvoice } from "./invoice";

describe("buildManualInvoice", () => {
  it("sums per-line amounts and applies per-line vat", () => {
    const inv = buildManualInvoice([
      { description: "Herstelling", quantity: 2, unit: "u", unitPrice: 60, vatRate: 21 },
      { description: "Materiaal", quantity: 1, unit: "st", unitPrice: 100, vatRate: 6 },
    ]);
    expect(inv.lines.map((l) => l.amount)).toEqual([120, 100]);
    expect(inv.net).toBe(220);
    expect(inv.vat).toBe(31.2); // 25.2 + 6
    expect(inv.total).toBe(251.2);
  });
  it("rounds money to cents", () => {
    const inv = buildManualInvoice([{ description: "x", quantity: 3, unit: "st", unitPrice: 9.99, vatRate: 21 }]);
    expect(inv.lines[0].amount).toBe(29.97);
    expect(inv.vat).toBe(6.29); // 6.2937 -> 6.29
    expect(inv.total).toBe(36.26);
  });
  it("defaults empty unit to st and keeps vatRate of first line", () => {
    const inv = buildManualInvoice([{ description: "y", quantity: 1, unit: "", unitPrice: 10, vatRate: 0 }]);
    expect(inv.lines[0].unit).toBe("st");
    expect(inv.vatRate).toBe(0);
    expect(inv.total).toBe(10);
  });
});
