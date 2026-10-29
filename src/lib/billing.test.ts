import { describe, expect, it } from "vitest";
import { billableHours, computeTotals, workOrderRevenue } from "./billing";

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
  it("under warranty drops the first hour and the kilometres", () => {
    const base = { hourlyRate: 60, distanceKm: 20, kmRate: 0.5, materials: [{ quantity: 1, unit_price: 10 }], vatRate: 0, warranty: true };
    const t = computeTotals({ ...base, seconds: 3600 + 20 * 60 });
    expect(t.labour).toBe(30);
    expect(t.km).toBe(0);
    expect(t.net).toBe(40);
    expect(computeTotals({ ...base, seconds: 40 * 60 }).labour).toBe(0);
  });
});

describe("workOrderRevenue", () => {
  const base = { seconds: 3600, hourlyRate: 60, distanceKm: 10, kmRate: 0.5, materials: [{ quantity: 1, unit_price: 20 }], vatRate: 21 };
  it("uses the paid amount when the bon is paid", () => {
    expect(workOrderRevenue({ ...base, paidAmount: 100 })).toBe(100);
  });
  it("computes the total when there is no payment yet", () => {
    // 1 u × 60 + 10 km × 0,5 + 20 materiaal = 85 netto, +21% = 102,85
    expect(workOrderRevenue({ ...base, paidAmount: null })).toBe(102.85);
  });
});
