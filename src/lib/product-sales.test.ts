import { describe, expect, it } from "vitest";
import { appProductLines } from "./product-sales";
import { simplaProductLines } from "./simpla-product-revenue";
import { productRevenue } from "./product-revenue";

describe("product sales sources", () => {
  it("uses invoice date and stored discounted net, including linked work orders", () => {
    expect(appProductLines([{ id: "a", number: "20260001", issue_date: "2026-10-28", kind: "factuur", lines: [{ description: "Riostop", quantity: 2, unitPrice: 100, discount: 10, amount: 180 }] }], "2026-10-28", "2026-10-28")[0]).toMatchObject({ amount: 180, date: "2026-10-28", source: "app" });
  });
  it("keeps negative reductions and makes credit notes negative once", () => {
    const rows = appProductLines([{ id: "a", number: "1", issue_date: "2026-01-01", kind: "factuur", lines: [{ description: "Riostop", quantity: 1, amount: -10 }] }, { id: "b", number: "2", issue_date: "2026-01-01", kind: "creditnota", lines: [{ description: "Riostop", quantity: 1, amount: -75 }] }], "2026-01-01", "2026-01-01");
    expect(rows.map(l => l.amount)).toEqual([-10, -75]);
  });
  it("deduplicates source invoice numbers and does not drop later legacy invoices by a work-day cutoff", () => {
    const bills = [{ billDatabaseId: 1, billId: "20260001", billDate: "2026-10-28" }, { billDatabaseId: 2, billId: "20260001", billDate: "2026-10-28" }];
    const lines = [1, 2].map(billDatabaseId => ({ billDatabaseId, billLineNumber: 1, billLineUnitPrice: 75, billLineProductDescription: "Riostop" }));
    expect(simplaProductLines(bills, lines, "2026-01-01", "2026-12-31", null)).toHaveLength(1);
    expect(simplaProductLines(bills, lines, "2026-01-01", "2026-12-31", null, ["20260001"])).toHaveLength(0);
  });
  it("never silently assigns ambiguous historical camera sizes", () => {
    expect(productRevenue([{ name: "Camera-inspectie 110-200mm", quantity: 1, amount: 125 }]).reduce((s,g) => s+g.amount, 0)).toBe(0);
  });
});