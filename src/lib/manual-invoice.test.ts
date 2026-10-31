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
    expect(inv.lines[0]?.amount).toBe(29.97);
    expect(inv.vat).toBe(6.29); // 6.2937 -> 6.29
    expect(inv.total).toBe(36.26);
  });
  it("defaults empty unit to st and keeps vatRate of first line", () => {
    const inv = buildManualInvoice([{ description: "y", quantity: 1, unit: "", unitPrice: 10, vatRate: 0 }]);
    expect(inv.lines[0]?.unit).toBe("st");
    expect(inv.vatRate).toBe(0);
    expect(inv.total).toBe(10);
  });
});

import { buildManualInvoice as bmi } from "./invoice";
describe("kortingspercentage per lijn", () => {
  it("10% korting op 2 x 100 geeft 180 netto", () => {
    const r = bmi([{ description: "x", quantity: 2, unit: "st", unitPrice: 100, vatRate: 21, discount: 10 }]);
    expect(r.lines[0]!.amount).toBe(180);
    expect(r.lines[0]!.originalUnitPrice).toBe(100);
    expect(r.net).toBe(180);
    expect(r.vat).toBe(37.8);
  });
});
