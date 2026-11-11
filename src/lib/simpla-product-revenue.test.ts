import { describe, expect, it } from "vitest";
import { simplaProductLines } from "./simpla-product-revenue";

const bills = [
  { billDatabaseId: 1, billDate: "2025-03-01T00:00:00", billStatus: "LOCKED" },
  { billDatabaseId: 2, billDate: "2025-03-02T00:00:00", billStatus: "DRAFT" },
  { billDatabaseId: 3, billDate: "2026-10-28T00:00:00", billStatus: "LOCKED" },
];
const lines = [
  { billDatabaseId: 1, billLineProductDescription: "Ledigen septische put", billLineUnitPrice: 200, billLineNumber: 1, billLineDiscount: 10 },
  { billDatabaseId: 2, billLineProductDescription: "Ledigen septische put", billLineUnitPrice: 200, billLineNumber: 1 },
  { billDatabaseId: 3, billLineProductDescription: "Ledigen septische put", billLineUnitPrice: 200, billLineNumber: 1 },
];

describe("simplaProductLines", () => {
  it("telt percentagekorting af en slaat concepten over", () => {
    expect(simplaProductLines(bills, lines, "2025-01-01", "2026-12-31", "2026-10-27")).toMatchObject([{ name: "Ledigen septische put", quantity: 1, amount: 180, source: "simpla", date: "2025-03-01" }]);
  });
  it("telt niets vanaf de eerste werkdag van de app", () => {
    expect(simplaProductLines(bills, lines, "2026-10-01", "2026-12-31", "2026-10-27")).toEqual([]);
  });
  it("trekt Simpla-creditnota’s negatief af zonder dubbeltelling van negatieve bedragen", () => {
    const r = simplaProductLines([{ billDatabaseId: 9, billId: "CN9", billDate: "2026-01-01", credit: true }], [{ billDatabaseId: 9, billLineProductDescription: "Riostop", billLineNumber: 2, billLineUnitPrice: -100, billLineDiscount: 10 }], "2026-01-01", "2026-01-01", null);
    expect(r[0]).toMatchObject({ amount: -180, quantity: -2, source: "simpla" });
  });
});
