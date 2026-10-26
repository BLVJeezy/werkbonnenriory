import { describe, expect, it } from "vitest";
import { billableHours, computeTotals } from "./billing";

describe("billableHours", () => {
  it("charges the first hour in full", () => {
    expect(billableHours(10 * 60)).toBe(1);
    expect(billableHours(3600)).toBe(1);
  });
  it("charges per started quarter after the first hour", () => {
    expect(billableHours(3601)).toBe(1.25);
    expect(billableHours(3600 + 16 * 60)).toBe(1.5);
  });
  it("charges nothing without time", () => {
    expect(billableHours(0)).toBe(0);
  });
});

describe("computeTotals", () => {
  it("adds labour, km and materials, then VAT", () => {
    const t = computeTotals({
      seconds: 3600 + 20 * 60,
      hourlyRate: 60,
      distanceKm: 20,
      kmRate: 0.5,
      materials: [{ quantity: 2, unit_price: 5 }],
      vatRate: 21,
    });
    expect(t.labour).toBe(90);
    expect(t.km).toBe(10);
    expect(t.net).toBe(110);
    expect(t.total).toBe(133.1);
  });
});
